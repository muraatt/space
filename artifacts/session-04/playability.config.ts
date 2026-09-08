import { resolve } from 'node:path';
import base from '../../playwright.config';
// Reuse only the separately launched, loopback-bound test world. This avoids
// Windows webServer teardown hanging after the existing tests have finished.
export default {
  ...base,
  testDir: resolve('packages/test-tools/tests'),
  outputDir: resolve('artifacts/session-04/playability-test-output'),
  reporter: [['list'], ['json', { outputFile: resolve('artifacts/session-04/playability-results.json') }]],
  webServer: undefined,
};
