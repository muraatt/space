import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ready, reset } from '../src/runner';
import { orbitDay } from '../src/scenarios/orbit_day';

const evidence = resolve('artifacts/session-04/ui-architecture');

test('final HUD architecture evidence', async ({ page, request }) => {
  await mkdir(evidence, { recursive: true });
  await reset(request, { ...orbitDay, paused: false });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?scene=orbit_day&backend=webgl2');
  await ready(page);
  await page.getByLabel('Uçuş görünümü').click({ position: { x: 1000, y: 500 } });
  await expect(page.getByLabel('Canlı 3B yörünge haritası')).toBeVisible();
  await page.screenshot({ path: resolve(evidence, '01-normal-flight-hud.png') });

  await page.getByLabel('Operasyon paneli').getByRole('button', { name: /OPS/ }).click();
  await expect(page.getByLabel('Operasyon paneli')).toHaveClass(/expanded/);
  await page.screenshot({ path: resolve(evidence, '02-expanded-ops.png') });
  await page.getByLabel('Operasyon paneli').getByRole('button', { name: /OPS/ }).click();

  await page.getByRole('button', { name: 'MANEVRA BİLGİSAYARI' }).click();
  await page.getByLabel('Manevra bilgisayarı').locator('select').selectOption('inspection-450');
  await page.getByRole('button', { name: 'MANEVRA SEÇENEKLERİNİ HESAPLA' }).click();
  await expect(page.getByTestId('candidate-economic')).toBeVisible();
  await page.screenshot({ path: resolve(evidence, '03-maneuver-overlay.png') });

  await reset(request, { ...orbitDay, id: 'orbit_night', paused: false });
  await page.goto('/?scene=orbit_night&backend=webgl2');
  await ready(page);
  await page.getByRole('button', { name: 'ATEŞ KONTROLÜ' }).click();
  await page.getByTestId('select-target').click();
  await page.getByRole('button', { name: 'Savaş panelini kapat' }).click();
  await expect(page.getByLabel('Sayısal uçuş telemetrisi')).toContainText('TARGET');
  await page.screenshot({ path: resolve(evidence, '04-target-combat-hud.png') });
});
