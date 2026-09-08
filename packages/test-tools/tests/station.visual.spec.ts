import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { ready, reset } from '../src/runner';
import { stationDocking } from '../src/scenarios/station_docking';
import { stationRendezvous } from '../src/scenarios/station_rendezvous';

const evidence = 'artifacts/station-phase-01';

test('station rendezvous, approach and docked service visual verification', async ({ page, request }) => {
  test.setTimeout(60_000);
  await mkdir(evidence, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await reset(request, stationRendezvous);
  await page.goto('/?scene=station_rendezvous&backend=webgl2');
  await ready(page);
  await page.getByRole('button', { name: 'İSTASYONU HEDEFLE' }).click();
  await expect(page.getByTestId('docking-guidance')).toBeVisible();
  await page.screenshot({ path: `${evidence}/01-station-rendezvous.png` });

  await page.getByRole('button', { name: 'MANEVRA BİLGİSAYARI' }).click();
  await page.getByLabel('Manevra bilgisayarı').getByRole('button', { name: 'MANEVRA SEÇENEKLERİNİ HESAPLA' }).click();
  await expect(page.getByTestId('candidate-balanced')).toBeVisible();
  await page.getByTestId('candidate-balanced').click();
  await page.screenshot({ path: `${evidence}/02-station-plan.png` });

  await reset(request, stationDocking);
  await page.goto('/?scene=station_docking&backend=webgl2');
  await ready(page);
  await page.getByRole('button', { name: 'İSTASYONU HEDEFLE' }).click();
  await expect(page.getByTestId('docking-telemetry')).toContainText('FINAL APPROACH');
  const start = await page.evaluate(() => window.__ORBITAL__!.getFrameTimes().length);
  await page.waitForTimeout(3_000);
  const performance = await page.evaluate((from) => {
    const frames = window.__ORBITAL__!.getFrameTimes().slice(from).sort((a, b) => a - b);
    const metrics = window.__ORBITAL__!.getMetrics();
    return {
      backend: metrics.backend,
      viewport: `${innerWidth}x${innerHeight}`,
      durationSeconds: 3,
      frames: frames.length,
      averageFrameMs: frames.reduce((sum, value) => sum + value, 0) / Math.max(1, frames.length),
      p95FrameMs: frames[Math.min(frames.length - 1, Math.floor(frames.length * 0.95))] ?? 0,
      drawCalls: metrics.drawCalls,
      triangles: metrics.triangles,
      rttMs: metrics.rttMs,
      server: metrics.server,
    };
  }, start);
  await writeFile(`${evidence}/performance.json`, `${JSON.stringify(performance, null, 2)}\n`);
  await page.screenshot({ path: `${evidence}/03-final-approach.png` });

  const canvas = page.getByLabel('Uçuş görünümü');
  await canvas.click({ position: { x: 900, y: 420 } });
  await page.keyboard.down('w');
  await page.waitForTimeout(150);
  await page.keyboard.up('w');
  await expect.poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.docking.metrics!.rangeM), {
    timeout: 15_000,
  }).toBeLessThan(3.1);
  const ops = page.getByLabel('Operasyon paneli');
  await ops.getByRole('button', { name: /OPS/ }).click();
  await page.getByTestId('request-dock').click();
  await expect.poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.docking.phase)).toBe('DOCKED');
  await page.getByTestId('station-services').click();
  await expect(page.getByLabel('Hangar ve servisler')).toContainText('AEGIS / DOCKED');
  await page.screenshot({ path: `${evidence}/04-docked-services.png` });
  expect(errors).toEqual([]);
});
