import { expect, test } from '@playwright/test';
import { ready, reset } from '../src/runner';
import { intercept } from '../src/scenarios/intercept';

test('Session 4 targeting, incoming threat and intercept combat evidence', async ({ page, request }) => {
  await reset(request, intercept);
  await page.goto('/?scene=intercept&backend=webgl2');
  await ready(page);
  await page.getByTestId('faction-vanguard').click();
  await page.getByLabel('Görev kontrolü').getByRole('button', { name: 'YENİLE' }).click();
  await page.getByTestId('mission-intercept').getByRole('button', { name: 'GÖREVİ KABUL ET' }).click();
  await page.getByTestId('identify-target').click();
  await page.getByRole('button', { name: 'ATEŞ KONTROLÜ' }).click();
  await expect(page.getByTestId('incoming-missile')).toBeVisible();
  const metrics = await page.evaluate(() => ({
    renderer: window.__ORBITAL__!.getMetrics(),
    activeMissiles: window.__ORBITAL__!.getState()!.combat.missiles.filter((item) => item.status === 'ACTIVE').length,
    backend: new URLSearchParams(location.search).get('backend'),
    viewport: `${innerWidth}x${innerHeight}@${devicePixelRatio}`,
  }));
  console.log(`COMBAT_METRICS=${JSON.stringify(metrics)}`);
  await page.screenshot({ path: 'artifacts/session-04/incoming-countermeasure.png' });

  await page.getByTestId('countermeasure').getByRole('button', { name: 'KARŞI TEDBİR' }).click();
  await page.getByTestId('select-target').click();
  await page.getByTestId('laser-weapon').getByRole('button', { name: 'LAZER ATEŞLE' }).click();
  await page.screenshot({ path: 'artifacts/session-04/target-laser.png' });

  await page.getByRole('button', { name: 'GÖREV KONTROLÜ' }).click();
  await expect(page.getByTestId('intercept-progress')).toContainText('12/40 HASAR');
  await page.screenshot({ path: 'artifacts/session-04/intercept-combat.png' });
});
