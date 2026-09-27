// CI diagnostic probe — runs the same boot sequence as ci.yml with verbose output
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');
const req = createRequire(__filename);

console.log('PORT env =', JSON.stringify(process.env.PORT));
console.log('node', process.version);

const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'start'], {
  stdio: 'inherit',
  env: process.env,
  shell: false,
});

const base = 'http://localhost:3100';
let ok = false;
for (let i = 1; i <= 30; i++) {
  try {
    const res = await fetch(base + '/api/health', { signal: AbortSignal.timeout(2000) });
    if (res.ok) { console.log(`health OK after ${i} polls`); ok = true; break; }
    console.log(`poll ${i}: ${res.status}`);
  } catch (e) {
    console.log(`poll ${i}: ${e.cause?.code ?? e.message}`);
  }
  await new Promise((r) => setTimeout(r, 1000));
}
if (!ok) { console.log('SERVER NEVER BECAME HEALTHY'); child.kill(); process.exit(1); }

// quick auth round-trip with full error output
try {
  const res = await fetch(base + '/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', email: 'analyst@nutripack.demo', password: 'demo123' }),
  });
  const data = await res.json();
  console.log('login status:', res.status, '| ok:', data.ok, '| errors:', JSON.stringify(data.errors ?? null));
} catch (e) {
  console.log('login fetch failed:', e.message);
}

child.kill();
process.exit(0);
