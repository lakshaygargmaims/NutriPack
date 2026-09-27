import crypto from 'crypto';
import type { SessionUser, StoredUser } from '../domain/types';
import { getDb } from './store';

/**
 * Token auth: HMAC-signed payload with expiry. AUTH_SECRET is REQUIRED at
 * runtime — the first token operation throws without it, so a misconfigured
 * production deploy fails loudly instead of silently using a dev secret.
 * (Checked lazily because Next.js evaluates route modules during build.)
 */
function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s === 'change-me-in-production') {
    throw new Error('AUTH_SECRET must be set to a strong random value (see .env.example).');
  }
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export function createToken(user: StoredUser): string {
  const body = Buffer.from(
    JSON.stringify({ id: user.id, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 }),
  ).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function verifyToken(token?: string | null): SessionUser | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig || !safeEqual(sign(body), sig)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    const db = getDb();
    const user = db.users.find((u) => u.id === payload.id);
    if (!user) return null;
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  } catch {
    return null;
  }
}

export { hashPassword, verifyPassword } from './passwords';

export function requireRole(user: SessionUser | null, roles: Array<SessionUser['role']>): boolean {
  return !!user && roles.includes(user.role);
}

export function parseAuthHeader(req: Request): string | null {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7);
}
