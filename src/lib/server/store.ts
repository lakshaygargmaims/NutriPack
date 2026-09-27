import fs from 'fs';
import path from 'path';
import type { DbShape } from '../domain/types';
import { COMMODITIES, MATERIALS, SOURCES, DEFAULT_WEIGHTS } from '../domain/referenceData';
import { hashPassword } from './passwords';

/**
 * Persistence: embedded JSON document store (zero external services).
 * PostgreSQL-ready: see DATABASE.md for the normalized schema; the DbShape
 * interface mirrors the entity design so migration is mechanical.
 */

// On Railway a volume is mounted (path exposed via RAILWAY_VOLUME_MOUNT_PATH);
// off-platform we keep the store inside ./data next to the app.
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'nutripack.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

const DEFAULT_DB: DbShape = {
  version: 1,
  seededAt: '',
  users: [],
  commodities: COMMODITIES,
  materials: MATERIALS,
  sources: SOURCES,
  projects: [],
  experiments: [],
  auditLog: [],
};

let cache: DbShape | null = null;

export function seedDemoUsers(): DbShape['users'] {
  return [
    { id: 'u-admin', name: 'Admin (Demo)', email: 'admin@nutripack.demo', passwordHash: hashPassword('demo123'), role: 'admin', organization: 'NutriPack', createdAt: new Date().toISOString() },
    { id: 'u-analyst', name: 'Analyst (Demo)', email: 'analyst@nutripack.demo', passwordHash: hashPassword('demo123'), role: 'analyst', organization: 'Demo Foods Pvt Ltd', createdAt: new Date().toISOString() },
  ];
}

export function getDb(): DbShape {
  if (cache) return cache;
  try {
    if (fs.existsSync(DB_FILE)) {
      cache = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')) as DbShape;
      migrate(cache);
      return cache;
    }
  } catch {
    // fall through to reseed
  }
  const db = { ...DEFAULT_DB, seededAt: new Date().toISOString(), users: seedDemoUsers() };
  persist(db);
  cache = db;
  return db;
}

/**
 * Reference-data migration: the JSON store persists commodity/material arrays
 * that ship with the app. When the code adds new entries (or the arrays are
 * emptied), merge them in — user-created rows are preserved, code-defined rows
 * are upserted by id. Never deletes existing data.
 */
function migrate(db: DbShape): void {
  let changed = false;
  const upsert = <T extends { id: string }>(current: T[], shipped: T[]): { list: T[]; changed: boolean } => {
    let dirty = false;
    const byId = new Map(current.map((x) => [x.id, x]));
    for (const item of shipped) {
      if (!byId.has(item.id)) {
        byId.set(item.id, item);
        dirty = true;
      }
    }
    return { list: [...byId.values()], changed: dirty };
  };
  const commodities = upsert(db.commodities ?? [], COMMODITIES);
  if (commodities.changed) { db.commodities = commodities.list; changed = true; }
  const materials = upsert(db.materials ?? [], MATERIALS);
  if (materials.changed) { db.materials = materials.list; changed = true; }
  if (!db.users?.length) { db.users = seedDemoUsers(); changed = true; }
  if (changed) persist(db);
}

export function persist(db?: DbShape): void {
  const target = db ?? cache;
  if (!target) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(target));
  fs.renameSync(tmp, DB_FILE); // atomic swap
  cache = target;
}

export function updateDb<T>(mutator: (db: DbShape) => T): T {
  const db = getDb();
  const result = mutator(db);
  persist(db);
  return result;
}

export function audit(actor: string, action: string, detail?: string): void {
  updateDb((db) => {
    db.auditLog.unshift({ at: new Date().toISOString(), actor, action, detail });
    db.auditLog = db.auditLog.slice(0, 500);
  });
}

export function uploadDir(): string {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  return UPLOAD_DIR;
}

export { DEFAULT_WEIGHTS };
