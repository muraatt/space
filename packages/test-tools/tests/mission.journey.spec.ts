import { expect, test } from '@playwright/test';
import { ready, reset } from '../src/runner';
import { cargoMission } from '../src/scenarios/cargo_mission';

test('cargo_mission: faction, reachable offer, cargo identity, completion and reward', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await reset(request, cargoMission);
  await page.goto('/?scene=cargo_mission&backend=webgl2');
  await ready(page);
  const panel = page.getByLabel('Görev kontrolü');
  await expect(panel).toBeVisible();
  await page.getByTestId('faction-aurora').click();
  await expect(page.getByLabel('Pilot profili')).toContainText('Aurora Sivil Ağı');
  const initialCredits = await page.getByTestId('profile-credits').textContent();
  await panel.getByRole('button', { name: 'YENİLE' }).click();
  const cargo = page.getByTestId('mission-cargo').first();
  await expect(cargo).toBeVisible({ timeout: 8000 });
  await expect(cargo).toContainText('Denetim Halkası · 450 km');
  await expect(cargo).toContainText('320 kg');
  const massBefore = await page.evaluate(() => window.__ORBITAL__!.getState()!.ship.mass.cargoKg);
  await cargo.getByRole('button', { name: 'GÖREVİ KABUL ET' }).click();
  await expect(page.getByLabel('Etkin görev')).toBeVisible();
  await expect(page.getByLabel('Etkin görev')).toContainText('HEDEF MENZİLİNDE');
  await expect
    .poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.ship.mass.cargoKg))
    .toBe(massBefore + 320);
  await page.getByTestId('deliver-cargo').click();
  await expect(panel).toContainText('GÖREV TAMAMLANDI');
  await expect(page.getByTestId('profile-credits')).not.toHaveText(initialCredits ?? '');
  expect(await page.evaluate(() => window.__ORBITAL__!.getState()!.profile.credits)).toBe(3900);
  expect(await page.evaluate(() => window.__ORBITAL__!.getState()!.profile.reputation)).toBe(8);
  expect(await page.evaluate(() => window.__ORBITAL__!.getState()!.ship.mass.cargoKg)).toBe(0);
  expect(errors).toEqual([]);
});

test('reconnaissance offer transfers its target into the existing maneuver planner', async ({
  page,
  request,
}) => {
  await reset(request, cargoMission);
  await page.goto('/?scene=cargo_mission&backend=webgl2');
  await ready(page);
  await page.getByTestId('faction-vanguard').click();
  const panel = page.getByLabel('Görev kontrolü');
  await panel.getByRole('button', { name: 'YENİLE' }).click();
  const recon = page.getByTestId('mission-reconnaissance');
  await expect(recon).toBeVisible({ timeout: 8000 });
  await recon.getByRole('button', { name: 'GÖREVİ KABUL ET' }).click();
  await page.getByRole('button', { name: 'HEDEFİ MANEVRAYA AKTAR' }).click();
  await expect(page.getByLabel('Manevra bilgisayarı')).toBeVisible();
  await expect(page.getByLabel('Manevra bilgisayarı').locator('select')).toHaveValue('service-800');
});
