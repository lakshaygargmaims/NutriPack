// CI diagnostic probe: boot the production server if it isn't already up,
// then verify health AND a full auth round-trip (login returns a signed token).
// Exits non-zero on any failure so misconfiguration surfaces HERE, with a
// readable message, instead of as an opaque crash later in the API suite.
import { spawn } from 'node:child_process';

const base = 'http://localhost:3100';

async function get(path, init) {
  const res = await fetch(base + path, { ...init, signal: AbortSignal.timeout(5000) });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON = the failure we're hunting */ }
  return { status: res.status, data };
}

async function waitForHealth(attempts) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const r = await get('/api/health');
      if (r.status === 200 && r.data?.ok) return i;
      console.log(`poll ${i}: status ${r.status}, body ${r.data === null ? 'NON-JSON' : JSON.stringify(r.data)}`);
    } catch (e) {
      console.log(`poll ${i}: ${e.cause?.code ?? e.message}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return 0;
}

async function main() {
  console.log('PORT env =', JSON.stringify(process.env.PORT));
  console.log('node', process.version);

  // Reuse an already-running server (the workflow boots one); spawn only if needed.
  let child = null;
  let poll = await waitForHealth(1).catch(() => 0);
  if (poll !== 1) {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    child = spawn(npmCmd, ['run', 'start'], { stdio: 'inherit', env: process.env, shell: true });
    poll = await waitForHealth(30);
  }
  if (poll === 0) {
    console.log('PROBE FAIL: server never became healthy');
    if (child) child.kill('SIGTERM');
    process.exitCode = 1;
    return;
  }
  console.log(`health OK after ${poll} poll(s)`);

  // Auth round-trip: login must return JSON with a token. This is the check
  // that catches a missing AUTH_SECRET (token signing throws → HTML 500).
  const login = await get('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', email: 'analyst@nutripack.demo', password: 'demo123' }),
  });
  const token = login.data?.token;
  console.log(`login status: ${login.status} | ok: ${login.data?.ok ?? 'NON-JSON BODY'} | token: ${token ? 'present' : 'MISSING'}`);

  if (child) child.kill('SIGTERM');

  if (login.status !== 200 || !token) {
    console.log('PROBE FAIL: login did not return a token — check AUTH_SECRET and server logs');
    process.exitCode = 1;
    return;
  }
  console.log('PROBE PASS: boot + health + auth round-trip');
}

main().catch((e) => { console.error('probe crashed:', e); process.exitCode = 1; });
