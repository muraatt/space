import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const result = spawnSync(
  process.execPath,
  [`${root}/packages/client/node_modules/vite/bin/vite.js`, 'build'],
  { cwd: `${root}/packages/client`, stdio: 'inherit' },
);
if (result.status !== 0) process.exit(result.status ?? 1);
const types = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit'], {
  stdio: 'inherit',
});
process.exitCode = types.status ?? 1;
