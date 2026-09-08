import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'packages/test-tools/tests',
  timeout: 45000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: 'artifacts/session-01/test-output',
  reporter: [['list'], ['json', { outputFile: 'artifacts/session-01/e2e-results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:5174',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node --import tsx packages/server/src/main.ts',
      url: 'http://127.0.0.1:8788/health',
      timeout: 30000,
      reuseExistingServer: false,
      env: { PORT: '8788', TEST_MODE: '1', TEST_TOKEN: 'orbital-isolated-test-01', IDENTITY_STORE_PATH: 'artifacts/shared-phase-00/test-identities.json' },
    },
    {
      command:
        'node packages/client/node_modules/vite/bin/vite.js packages/client --host 127.0.0.1 --port 5174 --strictPort',
      url: 'http://127.0.0.1:5174',
      timeout: 60000,
      reuseExistingServer: false,
      env: { PORT: '8788' },
    },
  ],
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.005, threshold: 0.2 } },
  snapshotPathTemplate: '{testDir}/baselines/{platform}/{testFilePath}/{arg}{ext}',
});
