// CI diagnostic probe — same boot sequence as ci.yml with verbose output.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

async function main() {
  console.log('PORT env =', JSON.stringify(process.env.PORT));
  console.log('node', process.version);

  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(npmCmd, ['run', 'start'], { stdio: 'inherit', env: process.env, shell: true });

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
  if (!ok) {
    console.log('SERVER NEVER BECAME HEALTHY');
    child.kill('SIGTERM');
    process.exit(1);
  }

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

  child.kill('SIGTERM');
  process.exit(0);
}

main().catch((e) => { console.error('probe crashed:', e); process.exit(1); });
