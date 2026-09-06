import type { APIRequestContext, Page } from '@playwright/test';
import type { Scenario } from './scenario';
export const TEST_SERVER = 'http://127.0.0.1:8788';
export const TEST_HEADERS = { 'x-test-token': 'orbital-isolated-test-01' };
export async function reset(request: APIRequestContext, scenario: Scenario) {
  const r = await request.post(`${TEST_SERVER}/__test/reset`, {
    headers: TEST_HEADERS,
    data: { scene: scenario.id, seed: scenario.seed, paused: scenario.paused },
  });
  if (!r.ok()) throw new Error(`Reset failed ${r.status()}`);
}
export async function ready(page: Page) {
  await page.waitForFunction(
    () => !!window.__ORBITAL__?.getState() && window.__ORBITAL__!.getMetrics().frames > 10,
    {},
    { timeout: 30000 },
  );
}
