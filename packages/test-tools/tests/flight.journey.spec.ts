import { test, expect } from '@playwright/test';
import { reset, ready } from '../src/runner';
import { orbitDay } from '../src/scenarios/orbit_day';
test('real controls: thrust, rotation, camera recovery and guide', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await reset(request, { ...orbitDay, paused: false });
  await page.goto('/?scene=orbit_day');
  await ready(page);
  await page.getByRole('button', { name: 'KUMANDAYI DEVRAL' }).click();
  const canvas = page.getByLabel('Uçuş görünümü');
  await canvas.click({ position: { x: 1050, y: 510 } });
  const before = await page.evaluate(() => window.__ORBITAL__!.getState()!);
  await page.keyboard.down('w');
  await page.waitForTimeout(1200);
  await expect
    .poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.controls.translation[2]))
    .toBe(-1);
  await page.keyboard.up('w');
  await page.waitForTimeout(350);
  const after = await page.evaluate(() => window.__ORBITAL__!.getState()!);
  expect(Math.hypot(...after.ship.velocity) - Math.hypot(...before.ship.velocity)).toBeGreaterThan(2);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(1100);
  await page.keyboard.up('ArrowRight');
  expect(
    await page.evaluate(() => Math.hypot(...window.__ORBITAL__!.getState()!.ship.angularVelocity)),
  ).toBeGreaterThan(0.1);
  await page.mouse.move(1050, 450);
  await page.mouse.down();
  await page.mouse.move(1230, 540, { steps: 12 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.__ORBITAL__!.getCamera().yaw)).not.toBeCloseTo(0.64);
  await page.getByRole('button', { name: /Kamerayı toparla/ }).click();
  expect(await page.evaluate(() => window.__ORBITAL__!.getCamera().yaw)).toBeCloseTo(0.64);
  await page.getByRole('button', { name: /KONTROLLER/ }).click();
  await expect(page.getByRole('dialog', { name: 'Uçuş kontrolleri' })).toBeVisible();
  await page.getByRole('button', { name: 'Kapat', exact: true }).click();
  await page.getByRole('button', { name: 'Telemetri ayrıntıları' }).click();
  await expect(page.getByLabel('Debug telemetri')).toBeVisible();
  expect(errors).toEqual([]);
});
test('scene switch and small desktop layout remain usable', async ({ page, request }) => {
  await reset(request, { ...orbitDay, paused: false });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await ready(page);
  await page.getByRole('button', { name: '◐ Gece', exact: true }).click();
  await ready(page);
  await expect(page.getByRole('heading', { name: 'Gece vardiyası' })).toBeVisible();
  expect(await page.evaluate(() => window.__ORBITAL__!.getState()!.scene)).toBe('orbit_night');
  const action = await page.getByRole('button', { name: 'KUMANDAYI DEVRAL' }).boundingBox();
  expect(action).not.toBeNull();
  expect(action!.y + action!.height).toBeLessThan(635);
});

test('controls stop on UI focus and debug reads cannot mutate the world', async ({ page, request }) => {
  await reset(request, { ...orbitDay, paused: false });
  await page.goto('/');
  await ready(page);
  await page.getByRole('button', { name: 'KUMANDAYI DEVRAL' }).click();
  await page.keyboard.down('w');
  await expect
    .poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.controls.translation[2]))
    .toBe(-1);
  await page.getByRole('button', { name: /KONTROLLER/ }).click();
  await expect
    .poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.controls.translation[2]))
    .toBe(0);
  await page.keyboard.up('w');
  await page.keyboard.press('Escape');
  await page.getByLabel('Uçuş görünümü').click({ position: { x: 1050, y: 510 } });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__ORBITAL__!.getState()!.controls.translation[2])).toBe(0);
  expect(
    await page.evaluate(() => {
      const debug = window.__ORBITAL__!;
      const copy = debug.getState()!;
      copy.ship.massKg = 1;
      return Object.isFrozen(debug) && debug.getState()!.ship.massKg !== 1;
    }),
  ).toBe(true);
});

test('missing WebGPU automatically selects the lightweight WebGL2 fallback', async ({ page, request }) => {
  await reset(request, orbitDay);
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true }),
  );
  await page.goto('/');
  await ready(page);
  expect(await page.evaluate(() => window.__ORBITAL__!.getMetrics().backend)).toBe('WebGL2');
  expect(await page.evaluate(() => window.__ORBITAL__!.getMetrics().antialiasSamples)).toBe(0);
});

test('pilot can reclaim the local development ship using the visible button', async ({
  page,
  context,
  request,
}) => {
  await reset(request, orbitDay);
  await page.goto('/');
  await ready(page);
  const other = await context.newPage();
  await other.goto('/');
  await ready(other);
  await expect(page.getByRole('alert')).toContainText('Kumanda başka sekmede');
  await page.getByRole('button', { name: 'KUMANDAYI DEVRAL' }).click();
  await expect(page.locator('.connection')).toContainText('Bağlı');
  await expect(other.getByRole('alert')).toContainText('Kumanda başka sekmede');
  await other.close();
});
