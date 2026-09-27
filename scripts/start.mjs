import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

/**
 * Cross-platform start wrapper.
 * Binds to $PORT when the platform provides one (Railway/Render/Heroku),
 * falling back to 3100 for local runs — no shell-specific syntax needed.
 */
const port = process.env.PORT || '3100';
const require = createRequire(import.meta.url);
const nextBin = require.resolve('next/dist/bin/next');

const child = spawn(process.execPath, [nextBin, 'start', '-p', port], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 0));
