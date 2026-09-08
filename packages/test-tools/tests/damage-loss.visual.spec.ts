import { expect, test } from '@playwright/test';
import { ready, reset } from '../src/runner';
import { missileHit } from '../src/scenarios/missile-hit';

test('Session 4 damage, loss and recovery evidence', async ({ page, request }) => {
  await reset(request, missileHit);
  await page.goto('/?scene=missile_hit&backend=webgl2');
  await ready(page);
  await expect(page.getByTestId('module-engine')).not.toContainText('%100', { timeout: 6000 });
  await page.screenshot({ path: 'artifacts/session-04/damaged-ship-hud.png' });

  await expect(page.getByTestId('recovery-card')).toContainText('GEMİ İMHA EDİLDİ', { timeout: 25000 });
  await page.getByTestId('recovery-card').evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: 'artifacts/session-04/destruction-loss.png' });

  await page.getByTestId('claim-replacement').click();
  await expect(page.getByTestId('recovery-card')).toContainText('YEDEK ARAÇ TESLİM EDİLDİ');
  const metrics = await page.evaluate(() => window.__ORBITAL__!.getMetrics());
  console.log(`DAMAGE_LOSS_METRICS=${JSON.stringify(metrics)}`);
  await page.screenshot({ path: 'artifacts/session-04/insurance-replacement.png' });
});
