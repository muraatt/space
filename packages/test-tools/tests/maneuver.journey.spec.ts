import { expect, test } from '@playwright/test';
import { reset, ready } from '../src/runner';
import { orbitManeuver } from '../src/scenarios/orbit_maneuver';
import { lowFuel } from '../src/scenarios/low_fuel';

test('orbit_maneuver: request, compare, select, execute, reject duplicate and cancel', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await reset(request, orbitManeuver);
  await page.goto('/?scene=orbit_maneuver&backend=webgl2');
  await ready(page);
  const panel = page.getByLabel('Manevra bilgisayarı');
  await expect(panel).toBeVisible();
  const baselineDrawCalls = await page.evaluate(() => window.__ORBITAL__!.getMetrics().drawCalls);
  await panel.getByRole('button', { name: 'MANEVRA SEÇENEKLERİNİ HESAPLA' }).click();
  await expect(page.getByTestId('candidate-economic')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('candidate-balanced')).toContainText('TOPLAM Δv');
  await expect(page.getByTestId('candidate-fast')).toContainText('KALAN Δv');
  await page.getByTestId('candidate-fast').click();
  await expect(page.getByTestId('candidate-fast')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('candidate-economic').click();
  await page.getByTestId('execute-maneuver').evaluate((button: HTMLElement) => {
    button.click();
    button.click();
  });
  await expect(panel).toContainText('KALKIŞ YANMASI', { timeout: 5000 });
  await expect(panel).toContainText(/Bu plan zaten yürütüldü|Etkin manevra tamamlanmadan yeni komut verilemez/);
  await expect
    .poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.maneuver?.status))
    .toBe('EXECUTING_BURN');
  await expect
    .poll(() => page.evaluate(() => window.__ORBITAL__!.getMetrics().drawCalls))
    .toBeGreaterThanOrEqual(baselineDrawCalls + 4);
  await page.getByTestId('cancel-maneuver').click();
  await expect(panel).toContainText('MANEVRA İPTAL EDİLDİ');
  await expect
    .poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.maneuver?.status))
    .toBe('CANCELLED');
  // The consumed plan remains visible; an attempted reuse must not freeze manual flight.
  await page.getByTestId('execute-maneuver').click();
  await expect(panel).toContainText('Bu plan zaten yürütüldü');
  await page.getByRole('button', { name: 'Manevra panelini kapat' }).click();
  await page.keyboard.down('w');
  await expect.poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.controls.translation[2])).toBe(-1);
  await page.keyboard.up('w');
  expect(errors).toEqual([]);
});

test('low_fuel: capability rejection and actual reserve HUD', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await reset(request, lowFuel);
  await page.goto('/?scene=low_fuel&backend=webgl2');
  await ready(page);
  const panel = page.getByLabel('Manevra bilgisayarı');
  await panel.getByRole('button', { name: 'MANEVRA SEÇENEKLERİNİ HESAPLA' }).click();
  await expect(panel.getByText('Yakıt bu rota için yetersiz').first()).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('execute-maneuver')).toHaveCount(0);
  expect(await page.evaluate(() => window.__ORBITAL__!.getState()!.ship.mass.propellantKg)).toBe(80);
  await page.getByRole('button', { name: 'Manevra panelini kapat' }).click();
  const telemetry = page.getByLabel('Sayısal uçuş telemetrisi');
  await expect(telemetry.getByText('FUEL', { exact: true }).locator('..')).toContainText('80kg');
  await expect(telemetry.getByText('FUEL%', { exact: true }).locator('..')).toContainText('4%');
  expect(errors).toEqual([]);
});
