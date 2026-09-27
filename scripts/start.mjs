import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

/**
 * Cross-platform start wrapper.
 * Binds to $PORT when the platform provides a usable one (Railway/Render/
 * Heroku), falling back to 3100 for local runs. '0' / empty / non-numeric
 * values are ignored — some CI environments export PORT=0 or garbage.
 */
const raw = Number(process.env.PORT);
const port = Number.isInteger(raw) && raw > 0 && raw < 65536 ? String(raw) : '3100';
const require = createRequire(import.meta.url);
const nextBin = require.resolve('next/dist/bin/next');

const child = spawn(process.execPath, [nextBin, 'start', '-p', port], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 0));
