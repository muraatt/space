import { expect, test, type Page } from '@playwright/test';
import { ready, reset, TEST_HEADERS, TEST_SERVER } from '../src/runner';
import { stationRendezvous } from '../src/scenarios/station_rendezvous';

async function pulse(page: Page, key: 'w' | 's', milliseconds: number) {
  await page.keyboard.down(key);
  await page.waitForTimeout(milliseconds);
  await page.keyboard.up(key);
}

test('station target, rendezvous, manual capture, service, undock and restored flight', async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await reset(request, stationRendezvous);
  await page.goto('/?scene=station_rendezvous&backend=webgl2');
  await ready(page);
  await expect(page.getByTestId('orbit-map-station')).toBeVisible();

  await page.getByRole('button', { name: 'İSTASYONU HEDEFLE' }).click();
  await expect(page.getByTestId('docking-telemetry')).toContainText('RENDEZVOUS');
  await page.getByRole('button', { name: 'MANEVRA BİLGİSAYARI' }).click();
  const planner = page.getByLabel('Manevra bilgisayarı');
  await expect(planner.locator('select')).toHaveValue('aegis-service-01');
  await planner.getByRole('button', { name: 'MANEVRA SEÇENEKLERİNİ HESAPLA' }).click();
  await expect(page.getByTestId('candidate-fast')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('candidate-fast').click();
  await page.getByTestId('execute-maneuver').click();
  await expect.poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.maneuver?.status), {
    timeout: 10_000,
  }).toBe('COASTING');

  const advanced = await request.post(`${TEST_SERVER}/__test/advance-maneuver`, { headers: TEST_HEADERS });
  expect(advanced.ok()).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.maneuver?.status), {
    timeout: 10_000,
  }).toBe('COMPLETE');
  await expect.poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.docking.phase)).toBe('FINAL_APPROACH');
  await page.getByRole('button', { name: 'Manevra panelini kapat' }).click();

  const canvas = page.getByLabel('Uçuş görünümü');
  await canvas.click({ position: { x: 900, y: 420 } });
  for (let i = 0; i < 260; i += 1) {
    const metrics = await page.evaluate(() => window.__ORBITAL__!.getState()!.docking.metrics!);
    if (metrics.rangeM <= 3.2 && metrics.relativeSpeedMps <= 0.9) break;
    if (metrics.rangeM > 30) {
      await pulse(page, metrics.closingSpeedMps < 4 ? 'w' : 's', 80);
    } else if (metrics.closingSpeedMps > 0.65) {
      await pulse(page, 's', 70);
    } else {
      await pulse(page, 'w', 45);
    }
    await page.waitForTimeout(70);
  }
  const capture = await page.evaluate(() => window.__ORBITAL__!.getState()!.docking.metrics!);
  expect(capture.rangeM).toBeLessThanOrEqual(3.5);
  expect(capture.relativeSpeedMps).toBeLessThanOrEqual(1);
  expect(capture.lateralErrorM).toBeLessThanOrEqual(2.5);

  const ops = page.getByLabel('Operasyon paneli');
  await ops.getByRole('button', { name: /OPS/ }).click();
  await page.getByTestId('request-dock').click();
  await expect.poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.docking.phase)).toBe('DOCKED');
  const creditsBefore = await page.evaluate(() => window.__ORBITAL__!.getState()!.profile.credits);
  await page.getByTestId('station-services').click();
  const hangar = page.getByLabel('Hangar ve servisler');
  await expect(hangar).toContainText('AEGIS SERVİS İSTASYONU');
  const fuelButton = page.getByTestId('fuel-service').getByRole('button', { name: 'YAKITI TAMAMLA' });
  await expect(fuelButton).toBeEnabled();
  await fuelButton.click();
  await expect.poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.profile.credits)).toBeLessThan(creditsBefore);

  await page.getByRole('button', { name: 'Hangarı kapat' }).click();
  await page.getByTestId('undock').click();
  await expect.poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.docking.phase)).toBe('FINAL_APPROACH');
  await canvas.click({ position: { x: 900, y: 420 } });
  await page.keyboard.down('w');
  await expect.poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.controls.translation[2])).toBe(-1);
  await page.keyboard.up('w');
  expect(errors).toEqual([]);
});
