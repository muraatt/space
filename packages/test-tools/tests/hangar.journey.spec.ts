import { expect, test, type Page } from '@playwright/test';
import { ready, reset } from '../src/runner';
import { stationDocking } from '../src/scenarios/station_docking';

async function completeCargo(page: Page) {
  const cargo = page.getByTestId('mission-cargo').first();
  await cargo.getByRole('button', { name: 'GÖREVİ KABUL ET' }).click();
  await expect(page.getByLabel('Etkin görev')).toContainText('HEDEF MENZİLİNDE');
  await page.getByTestId('deliver-cargo').click();
  await expect(page.getByLabel('Görev kontrolü')).toContainText('GÖREV TAMAMLANDI');
}

test('earn, service the second vehicle, install upgrade and return to interception', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await reset(request, stationDocking);
  await page.goto('/?scene=station_docking&backend=webgl2');
  await ready(page);
  await page.getByRole('button', { name: 'GÖREV KONTROLÜ' }).click();
  await page.getByTestId('faction-aurora').click();
  await page.getByLabel('Görev kontrolü').getByRole('button', { name: 'YENİLE' }).click();
  await expect(page.getByTestId('mission-cargo')).toHaveCount(2, { timeout: 10000 });
  await completeCargo(page);
  await completeCargo(page);
  await expect(page.getByTestId('profile-credits')).toHaveText('5.300');

  await page.getByRole('button', { name: 'Görev panelini kapat' }).click();
  await page.getByRole('button', { name: 'İSTASYONU HEDEFLE' }).click();
  await expect(page.getByTestId('docking-telemetry')).toContainText('FINAL APPROACH');
  await page.getByLabel('Uçuş görünümü').click({ position: { x: 1000, y: 500 } });
  await page.keyboard.down('w');
  await page.waitForTimeout(150);
  await page.keyboard.up('w');
  await expect.poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.docking.metrics!.rangeM), { timeout: 15000 }).toBeLessThan(3.1);
  const ops = page.getByLabel('Operasyon paneli');
  await ops.getByRole('button', { name: /OPS/ }).click();
  await page.getByTestId('request-dock').click();
  await expect.poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.docking.phase)).toBe('DOCKED');
  await page.getByTestId('station-services').click();
  const hangar = page.getByLabel('Hangar ve servisler');
  await expect(hangar).toBeVisible();
  await expect(hangar.getByLabel('Sahip olunan araçlar')).toContainText('Kestrel');
  await expect(hangar.getByLabel('Sahip olunan araçlar')).toContainText('Raptor');
  await page.getByTestId('select-raptor-01').click();
  await expect(page.getByTestId('ship-raptor-01')).toContainText('AKTİF ARAÇ');
  expect(await page.evaluate(() => window.__ORBITAL__!.getState()!.ship.definitionId)).toBe('RAPTOR_COMBAT');

  await page.getByTestId('fuel-service').getByRole('button', { name: 'YAKITI TAMAMLA' }).click();
  await expect(page.getByTestId('fuel-service')).toContainText('1600 / 1600 kg');
  await page.getByTestId('repair-service').getByRole('button', { name: 'ARACI ONAR' }).click();
  await expect(page.getByTestId('repair-service')).toContainText('%100');
  await page.getByTestId('ammo-service').getByRole('button', { name: 'MÜHİMMATI TAMAMLA' }).click();
  await expect(page.getByTestId('ammo-service')).toContainText('120 / 120 kg');
  await expect(page.getByTestId('hangar-credits')).toHaveText('4.735 kredi');

  const sensor = page.getByTestId('upgrade-survey-sensor-array');
  await sensor.getByRole('button', { name: '4.700 KR · KUR' }).click();
  await expect(sensor.getByRole('button')).toHaveText('KURULU');
  await expect(page.getByTestId('hangar-credits')).toHaveText('35 kredi');
  expect(
    await page.evaluate(() => window.__ORBITAL__!.getState()!.ship.performance.sensorScanTimeMultiplier),
  ).toBe(0.65);

  await page.getByRole('button', { name: 'Hangarı kapat' }).click();
  await page.getByTestId('undock').click();
  await expect.poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.docking.phase)).toBe('FINAL_APPROACH');
  await page.getByRole('button', { name: 'GÖREV KONTROLÜ' }).click();
  const intercept = page.getByTestId('mission-intercept');
  await expect(intercept).toBeVisible();
  await intercept.getByRole('button', { name: 'GÖREVİ KABUL ET' }).click();
  await page.getByRole('button', { name: 'HEDEFİ MANEVRAYA AKTAR' }).click();
  await expect(page.getByLabel('Manevra bilgisayarı').locator('select')).toHaveValue('phase-target');
  await page.getByRole('button', { name: 'Manevra panelini kapat' }).click();
  await page.keyboard.down('w');
  await expect.poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.controls.translation[2])).toBe(-1);
  await page.keyboard.up('w');
  expect(errors).toEqual([]);
});
