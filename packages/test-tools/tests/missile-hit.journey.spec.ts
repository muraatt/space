import { expect, test } from '@playwright/test';
import { ready, reset } from '../src/runner';
import { missileHit } from '../src/scenarios/missile-hit';

test('missile_hit demonstrates impact, subsystem damage, destruction and recovery', async ({ page, request }) => {
  await reset(request, missileHit);
  await page.goto('/?scene=missile_hit&backend=webgl2');
  await ready(page);
  const combat = page.getByLabel('Savaş kontrolü');
  await expect(combat).toBeVisible();
  await expect(combat).toContainText('MISSILE HIT', { timeout: 8000 });
  await expect(page.getByTestId('module-fuel')).not.toContainText('%100');
  await combat.getByRole('button', { name: 'Savaş panelini kapat' }).click();
  await expect(page.getByTestId('recovery-card')).toContainText('GEMİ İMHA EDİLDİ', { timeout: 25000 });
  await expect(page.getByRole('alert').filter({ hasText: 'Gemi imha edildi' })).toBeVisible();
  await expect(page.getByTestId('claim-replacement')).toBeInViewport();
  await page.getByTestId('claim-replacement').click();
  await expect(page.getByTestId('recovery-card')).toContainText('YEDEK ARAÇ TESLİM EDİLDİ');
  expect(await page.evaluate(() => window.__ORBITAL__!.getState()!.combat.playerDestroyed)).toBe(false);
  await page.getByRole('button', { name: 'Savaş panelini kapat' }).click();
  await page.keyboard.down('w');
  await expect.poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.controls.translation[2])).toBe(-1);
  await page.keyboard.up('w');
});
