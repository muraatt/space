import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const children = [
  spawn(process.execPath, ['--import', 'tsx', 'packages/server/src/main.ts'], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  }),
  spawn(
    process.execPath,
    [
      `${root}/packages/client/node_modules/vite/bin/vite.js`,
      ...(process.env.PREVIEW === '1' ? ['preview'] : []),
      '--host',
      '127.0.0.1',
      '--port',
      process.env.CLIENT_PORT ?? '5173',
      '--strictPort',
    ],
    { cwd: `${root}/packages/client`, stdio: 'inherit', env: process.env },
  ),
];
let stopping = false;
const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill();
  process.exitCode = code;
};
for (const c of children) c.on('exit', (code) => stop(code ?? 0));
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
