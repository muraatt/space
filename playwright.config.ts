import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'packages/test-tools/tests',
  timeout: 45000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: '.runs/playwright/test-output',
  reporter: [['list'], ['json', { outputFile: '.runs/playwright/results.json' }]],
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
      gracefulShutdown: { signal: 'SIGINT', timeout: 5_000 },
      env: {
        PORT: '8788', HOST: '127.0.0.1', TEST_MODE: '1', TEST_TOKEN: 'orbital-isolated-test-01',
        TEST_REPLACEMENT_CLOSE_DELAY_MS: '1000', IDENTITY_STORE_PATH: `.runs/playwright/test-identities-${process.pid}-${Date.now()}.json`,
        REQUIRE_DATABASE_URL: '', REQUIRE_ALLOWED_ORIGINS: '', DATABASE_URL: '',
      },
    },
    {
      command:
        'node packages/client/node_modules/vite/bin/vite.js packages/client --host 127.0.0.1 --port 5174 --strictPort',
      url: 'http://127.0.0.1:5174',
      timeout: 60000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGINT', timeout: 5_000 },
      env: { PORT: '8788' },
    },
  ],
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.005, threshold: 0.2 } },
  snapshotPathTemplate: '{testDir}/baselines/{platform}/{testFilePath}/{arg}{ext}',
});
