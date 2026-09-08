import { expect, test } from '@playwright/test';
import { ready, reset } from '../src/runner';
import { orbitDay } from '../src/scenarios/orbit_day';

test('three HUD layers keep live space telemetry and restore flight after every system overlay', async ({ page, request }) => {
  await reset(request, { ...orbitDay, paused: false });
  await page.goto('/?scene=orbit_day&backend=webgl2');
  await ready(page);
  const map = page.getByLabel('Canlı 3B yörünge haritası'), telemetry = page.getByLabel('Sayısal uçuş telemetrisi');
  await expect(map).toBeVisible();
  await expect(map).toContainText('ORBIT / LIVE');
  await expect(telemetry).toContainText('FLIGHT');
  await expect(telemetry).toContainText('ORBIT');
  await expect(telemetry).toContainText('SHIP');
  await expect(telemetry).toContainText('ATTITUDE');
  const markerBefore = await page.getByTestId('orbit-map-player').getAttribute('transform');
  await expect.poll(() => page.getByTestId('orbit-map-player').getAttribute('transform')).not.toBe(markerBefore);

  const ops = page.getByLabel('Operasyon paneli');
  await ops.getByRole('button', { name: /OPS/ }).click();
  await expect(ops).toHaveClass(/expanded/);
  await expect(ops).toContainText('NAVIGATION');
  await ops.getByRole('button', { name: /OPS/ }).click();
  await expect(ops).not.toHaveClass(/expanded/);

  for (const [openName, panelName, closeName] of [
    ['MANEVRA BİLGİSAYARI', 'Manevra bilgisayarı', 'Manevra panelini kapat'],
    ['GÖREV KONTROLÜ', 'Görev kontrolü', 'Görev panelini kapat'],
    ['HANGAR VE SERVİS', 'Hangar ve servisler', 'Hangarı kapat'],
    ['ATEŞ KONTROLÜ', 'Savaş kontrolü', 'Savaş panelini kapat'],
  ]) {
    await page.getByRole('button', { name: openName }).click();
    const panel = page.getByLabel(panelName, { exact: true });
    await expect(panel).toBeVisible();
    const bounds = await panel.boundingBox();
    expect(bounds?.width).toBeGreaterThan(1200);
    const close = panel.getByRole('button', { name: closeName });
    await expect(close).toBeInViewport();
    await close.click();
    await page.keyboard.down('w');
    await expect.poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.controls.translation[2])).toBe(-1);
    await page.keyboard.up('w');
  }
});

test('selected target adds stable relative and combat telemetry to the flight HUD', async ({ page, request }) => {
  await reset(request, { ...orbitDay, id: 'orbit_night', paused: false });
  await page.goto('/?scene=orbit_night&backend=webgl2');
  await ready(page);
  await page.getByRole('button', { name: 'ATEŞ KONTROLÜ' }).click();
  await page.getByTestId('select-target').click();
  await page.getByRole('button', { name: 'Savaş panelini kapat' }).click();
  const telemetry = page.getByLabel('Sayısal uçuş telemetrisi');
  await expect(telemetry).toContainText('TARGET');
  await expect(telemetry).toContainText('RANGE');
  await expect(telemetry).toContainText('REL-V');
  await expect(telemetry).toContainText('COMBAT');
  await expect(page.getByLabel('Canlı 3B yörünge haritası').locator('.map-target-marker')).toBeVisible();
});
