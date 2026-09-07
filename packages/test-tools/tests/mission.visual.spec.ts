import { expect, test } from '@playwright/test';
import { ready, reset } from '../src/runner';
import { cargoMission } from '../src/scenarios/cargo_mission';

test('Session 3 mission selection, active cargo and reward evidence', async ({ page, request }) => {
  await reset(request, cargoMission);
  await page.goto('/?scene=cargo_mission&backend=webgl2');
  await ready(page);
  await page.getByTestId('faction-aurora').click();
  const panel = page.getByLabel('Görev kontrolü');
  await panel.getByRole('button', { name: 'YENİLE' }).click();
  await expect(page.getByTestId('mission-cargo').first()).toBeVisible({ timeout: 8000 });
  await page.screenshot({ path: 'artifacts/session-03/mission-selection.png' });
  await page.getByTestId('mission-cargo').first().getByRole('button', { name: 'GÖREVİ KABUL ET' }).click();
  await expect(page.getByLabel('Etkin görev')).toContainText('ARAÇTA KİLİTLİ');
  await page.screenshot({ path: 'artifacts/session-03/active-cargo.png' });
  await page.getByTestId('deliver-cargo').click();
  await expect(panel).toContainText('GÖREV TAMAMLANDI');
  await page.screenshot({ path: 'artifacts/session-03/mission-complete.png' });
});
