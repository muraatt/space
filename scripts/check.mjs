import { spawnSync } from 'node:child_process';
for (const [file, args] of [
  ['node_modules/typescript/bin/tsc', ['--noEmit']],
  ['node_modules/eslint/bin/eslint.js', ['.']],
]) {
  const result = spawnSync(process.execPath, [file, ...args], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
