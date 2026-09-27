import { NextResponse } from 'next/server';
import { getDb, updateDb, audit } from '@/lib/server/store';
import { parseAuthHeader, verifyToken } from '@/lib/server/auth';
import type { FoodCommodity, PackagingMaterial, ReferenceSource } from '@/lib/domain/types';

/** Admin routes require the admin role (§25, §32). */
function requireAdmin(req: Request): { ok: true; email: string } | { ok: false } {
  const user = verifyToken(parseAuthHeader(req));
  if (!user || user.role !== 'admin') return { ok: false };
  return { ok: true, email: user.email };
}

export async function GET(req: Request) {
  const admin = requireAdmin(req);
  if (!admin.ok) return NextResponse.json({ ok: false, errors: ['Admin role required'] }, { status: 403 });
  const db = getDb();
  return NextResponse.json({
    ok: true,
    materials: db.materials,
    commodities: db.commodities,
    sources: db.sources,
    auditLog: db.auditLog.slice(0, 100),
    counts: { users: db.users.length, projects: db.projects.length, experiments: db.experiments.length },
  });
}

export async function POST(req: Request) {
  const admin = requireAdmin(req);
  if (!admin.ok) return NextResponse.json({ ok: false, errors: ['Admin role required'] }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ ok: false, errors: ['action required'] }, { status: 400 });

  switch (body.action) {
    case 'material.upsert': {
      const m = body.material as PackagingMaterial;
      if (!m?.id || !m.name) return NextResponse.json({ ok: false, errors: ['material.id and name required'] }, { status: 400 });
      updateDb((db) => {
        const idx = db.materials.findIndex((x) => x.id === m.id);
        if (idx >= 0) db.materials[idx] = { ...db.materials[idx], ...m };
        else db.materials.push(m);
      });
      audit(admin.email, 'material.upsert', m.id);
      return NextResponse.json({ ok: true });
    }
    case 'material.verify': {
      updateDb((db) => {
        const m = db.materials.find((x) => x.id === body.id);
        if (m) m.dataStatus = 'verified';
      });
      audit(admin.email, 'material.verify', body.id);
      return NextResponse.json({ ok: true });
    }
    case 'material.disable': {
      updateDb((db) => {
        const m = db.materials.find((x) => x.id === body.id);
        if (m) (m as any).disabled = true;
      });
      audit(admin.email, 'material.disable', body.id);
      return NextResponse.json({ ok: true });
    }
    case 'food.upsert': {
      const c = body.commodity as FoodCommodity;
      if (!c?.id || !c.name) return NextResponse.json({ ok: false, errors: ['commodity.id and name required'] }, { status: 400 });
      updateDb((db) => {
        const idx = db.commodities.findIndex((x) => x.id === c.id);
        if (idx >= 0) db.commodities[idx] = { ...db.commodities[idx], ...c };
        else db.commodities.push(c);
      });
      audit(admin.email, 'food.upsert', c.id);
      return NextResponse.json({ ok: true });
    }
    case 'source.add': {
      const s = body.source as ReferenceSource;
      if (!s?.id || !s.title) return NextResponse.json({ ok: false, errors: ['source.id and title required'] }, { status: 400 });
      updateDb((db) => {
        if (!db.sources.some((x) => x.id === s.id)) db.sources.push(s);
      });
      audit(admin.email, 'source.add', s.id);
      return NextResponse.json({ ok: true });
    }
    case 'weights.set': {
      updateDb((db) => {
        (db as any).scoringWeights = body.weights;
      });
      audit(admin.email, 'weights.set');
      return NextResponse.json({ ok: true, weights: body.weights });
    }
    default:
      return NextResponse.json({ ok: false, errors: [`Unknown action '${body.action}'`] }, { status: 400 });
  }
}
