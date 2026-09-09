import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { assertTestModeLoopback } from './startup-safety';

describe('authority startup safety', () => {
  it.each(['127.0.0.1', 'localhost', '::1', '[::1]'])('allows TEST_MODE on loopback host %s', (host) => {
    expect(() => assertTestModeLoopback(true, host)).not.toThrow();
  });

  it.each(['0.0.0.0', '::', '192.168.1.40', 'authority.example.com'])(
    'rejects TEST_MODE on non-loopback host %s',
    (host) => expect(() => assertTestModeLoopback(true, host)).toThrow(/loopback HOST/),
  );

  it('does not constrain production binding', () => {
    expect(() => assertTestModeLoopback(false, '0.0.0.0')).not.toThrow();
  });

  it('fails the real authority startup before a wildcard TEST_MODE listen', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'packages/server/src/main.ts'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 5_000,
        env: {
          ...process.env,
          DATABASE_URL: '',
          HOST: '0.0.0.0',
          PORT: '0',
          TEST_MODE: '1',
          TEST_TOKEN: 'loopback-regression-token',
        },
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('TEST_MODE requires a loopback HOST');
  });
});
