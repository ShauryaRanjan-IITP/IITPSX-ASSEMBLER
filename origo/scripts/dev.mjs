import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import process from 'node:process';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const electronPath = require('electron');

const server = await createServer();
await server.listen();
server.printUrls();

const devUrl = (server.resolvedUrls?.local?.[0] ?? 'http://localhost:5173/').replace(/\/$/, '');

const electron = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, ORIGO_DEV_URL: devUrl },
});

async function shutdown(code = 0) {
  try { electron.kill(); } catch { /* ignore */ }
  await server.close();
  process.exit(code);
}

electron.on('close', (code) => shutdown(code ?? 0));
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
