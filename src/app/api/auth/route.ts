import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb, updateDb, audit } from '@/lib/server/store';
import type { StoredUser } from '@/lib/domain/types';
import { createToken, hashPassword, parseAuthHeader, verifyToken } from '@/lib/server/auth';
import { verifyPassword, isLegacyHash } from '@/lib/server/passwords';
import { rateLimit, clientIp } from '@/lib/server/rateLimit';

const loginSchema = z.object({ action: z.literal('login'), email: z.string().email(), password: z.string().min(6) });
const registerSchema = z.object({
  action: z.literal('register'),
  email: z.string().email(),
  password: z.string().min(8, 'password must be ≥8 characters'),
  name: z.string().min(2),
  organization: z.string().optional(),
});

/**
 * Token issuance with a clean failure mode: if AUTH_SECRET is missing the
 * signer throws — return a JSON 503 naming the problem instead of letting an
 * opaque HTML 500 reach API clients (the bug this once caused in CI).
 */
function loginOk(user: StoredUser, safe: object) {
  try {
    return NextResponse.json({ ok: true, token: createToken(user), user: safe });
  } catch {
    return NextResponse.json(
      { ok: false, errors: ['Authentication is not configured on this server (missing AUTH_SECRET).'] },
      { status: 503 },
    );
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, errors: ['Invalid JSON'] }, { status: 400 });

  if (body.action === 'register') {
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ ok: false, errors: parsed.error.issues.map((i) => i.message) }, { status: 400 });
    const { email, password, name, organization } = parsed.data;
    const exists = getDb().users.some((u) => u.email === email);
    if (exists) return NextResponse.json({ ok: false, errors: ['Email already registered'] }, { status: 409 });
    if (!rateLimit(`register:${clientIp(req)}`, 5, 60 * 60_000)) {
      return NextResponse.json({ ok: false, errors: ['Too many registrations from this address. Try again later.'] }, { status: 429 });
    }
    const created: StoredUser = { id: `u-${Date.now()}`, name, email, passwordHash: hashPassword(password), role: 'analyst', organization, createdAt: new Date().toISOString() };
    updateDb((db) => {
      db.users.push(created);
    });
    audit(email, 'auth.register');
    const safe = { id: created.id, name: created.name, email: created.email, role: created.role, organization: created.organization, createdAt: created.createdAt };
    return loginOk(created, safe);
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, errors: ['Valid email and password (≥6 chars) required'] }, { status: 400 });
  const { email, password } = parsed.data;

  // Brute-force throttle: 20 attempts / 5 min / IP+email (genuine users retry
  // after typos; scripted tools hammering beyond this are the actual target)
  if (!rateLimit(`login:${clientIp(req)}:${email.toLowerCase()}`, 20, 5 * 60_000)) {
    return NextResponse.json({ ok: false, errors: ['Too many attempts. Try again in a few minutes.'] }, { status: 429 });
  }

  const user = getDb().users.find((u) => u.email === email);
  const valid = user ? verifyPassword(password, user.passwordHash) : false;
  if (!user || !valid) {
    return NextResponse.json({ ok: false, errors: ['Invalid credentials'] }, { status: 401 });
  }

  // Transparent upgrade of legacy length-salted hashes to per-user salted format
  if (isLegacyHash(user.passwordHash)) {
    updateDb((db) => {
      const u = db.users.find((x) => x.id === user.id);
      if (u) u.passwordHash = hashPassword(password);
    });
  }

  audit(email, 'auth.login');
  const safe = { id: user.id, name: user.name, email: user.email, role: user.role, organization: user.organization, createdAt: user.createdAt };
  return loginOk(user, safe);
}

export async function GET(req: Request) {
  let user = null;
  try {
    user = verifyToken(parseAuthHeader(req));
  } catch {
    // AUTH_SECRET missing — signer threw. Report config problem, not 401.
    return NextResponse.json(
      { ok: false, errors: ['Authentication is not configured on this server (missing AUTH_SECRET).'] },
      { status: 503 },
    );
  }
  if (!user) return NextResponse.json({ ok: false, errors: ['Not authenticated'] }, { status: 401 });
  return NextResponse.json({ ok: true, user });
}
