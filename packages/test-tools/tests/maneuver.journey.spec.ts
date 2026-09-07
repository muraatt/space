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
  await expect(panel).toContainText('Bu plan zaten yürütüldü');
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
  await expect(page.locator('.flight-strip')).toContainText('80 kg · 4%');
  await expect(page.getByTestId('execute-maneuver')).toHaveCount(0);
  expect(errors).toEqual([]);
});
