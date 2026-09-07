import { expect, test } from '@playwright/test';
import { ready, reset } from '../src/runner';
import { cargoMission } from '../src/scenarios/cargo_mission';

test('Session 3 hangar, serviced Raptor and interception evidence', async ({ page, request }) => {
  await reset(request, cargoMission);
  await page.goto('/?scene=cargo_mission&backend=webgl2');
  await ready(page);
  await page.getByTestId('faction-aurora').click();
  await page.getByLabel('Görev kontrolü').getByRole('button', { name: 'YENİLE' }).click();
  await expect(page.getByTestId('mission-cargo')).toHaveCount(2, { timeout: 10000 });
  for (let i = 0; i < 2; i++) {
    await page.getByTestId('mission-cargo').first().getByRole('button', { name: 'GÖREVİ KABUL ET' }).click();
    await expect(page.getByLabel('Etkin görev')).toContainText('HEDEF MENZİLİNDE');
    await page.getByTestId('deliver-cargo').click();
    await expect(page.getByLabel('Görev kontrolü')).toContainText('GÖREV TAMAMLANDI');
  }
  await page.getByRole('button', { name: 'HANGAR VE SERVİS' }).click();
  await expect(page.getByLabel('Hangar ve servisler')).toBeVisible();
  await page.screenshot({ path: 'artifacts/session-03/hangar.png' });

  await page.getByTestId('select-raptor-01').click();
  await page.getByTestId('fuel-service').getByRole('button', { name: 'YAKITI TAMAMLA' }).click();
  await page.getByTestId('repair-service').getByRole('button', { name: 'ARACI ONAR' }).click();
  await page.getByTestId('ammo-service').getByRole('button', { name: 'MÜHİMMATI TAMAMLA' }).click();
  await page
    .getByTestId('upgrade-survey-sensor-array')
    .getByRole('button', { name: '4.700 KR · KUR' })
    .click();
  await expect(page.getByTestId('upgrade-survey-sensor-array').getByRole('button')).toHaveText('KURULU');
  await page.screenshot({ path: 'artifacts/session-03/services-upgrades.png' });

  await page.getByRole('button', { name: 'GÖREV KONTROLÜ' }).click();
  await expect(page.getByTestId('mission-intercept')).toBeVisible();
  await page.screenshot({ path: 'artifacts/session-03/raptor-interception.png' });
});
