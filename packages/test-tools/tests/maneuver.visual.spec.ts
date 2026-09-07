import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { reset, ready } from '../src/runner';
import { orbitManeuver } from '../src/scenarios/orbit_maneuver';
import { lowFuel } from '../src/scenarios/low_fuel';

test('capture Session 2 maneuver UI states for one inspection pass', async ({ page, request }) => {
  await mkdir('artifacts/session-02', { recursive: true });
  await reset(request, orbitManeuver);
  await page.goto('/?scene=orbit_maneuver&backend=webgl2');
  await ready(page);
  const panel = page.getByLabel('Manevra bilgisayarı'),
    baseline = await page.evaluate(() => window.__ORBITAL__!.getMetrics());
  await panel.getByRole('button', { name: 'MANEVRA SEÇENEKLERİNİ HESAPLA' }).click();
  await expect(page.getByTestId('candidate-economic')).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(750);
  const selection = await page.evaluate(() => window.__ORBITAL__!.getMetrics());
  await page.screenshot({ path: 'artifacts/session-02/maneuver-selection.png' });

  await page.getByTestId('execute-maneuver').click();
  await expect(panel).toContainText('KALKIŞ YANMASI', { timeout: 5000 });
  await page.waitForTimeout(750);
  const active = await page.evaluate(() => window.__ORBITAL__!.getMetrics());
  await page.screenshot({ path: 'artifacts/session-02/maneuver-active.png' });

  await reset(request, lowFuel);
  await page.goto('/?scene=low_fuel&backend=webgl2');
  await ready(page);
  const lowFuelPanel = page.getByLabel('Manevra bilgisayarı');
  await lowFuelPanel.getByRole('button', { name: 'MANEVRA SEÇENEKLERİNİ HESAPLA' }).click();
  await expect(lowFuelPanel.getByText('Yakıt bu rota için yetersiz').first()).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'artifacts/session-02/low-fuel.png' });

  await writeFile(
    'artifacts/session-02/ui-render-metrics.json',
    JSON.stringify(
      {
        kind: 'short-visual-smoke-not-reference-gpu-performance',
        browser: 'Chrome',
        backend: active.backend,
        adapter: active.adapter,
        viewport: active.viewport,
        baseline: { drawCalls: baseline.drawCalls, triangles: baseline.triangles },
        selection: {
          drawCalls: selection.drawCalls,
          triangles: selection.triangles,
          frameMs: selection.frameMs,
          p95Ms: selection.p95Ms,
        },
        active: {
          drawCalls: active.drawCalls,
          triangles: active.triangles,
          frameMs: active.frameMs,
          p95Ms: active.p95Ms,
        },
      },
      null,
      2,
    ),
  );
});
