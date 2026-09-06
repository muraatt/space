import { test, expect } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import { reset, ready } from '../src/runner';
import { orbitDay } from '../src/scenarios/orbit_day';
import { orbitNight } from '../src/scenarios/orbit_night';
for (const backend of ['webgpu', 'webgl2'])
  for (const scene of [orbitDay, orbitNight]) {
    test(`${scene.id} / ${backend}: image, telemetry and bounded draw count`, async ({ page, request }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await reset(request, scene);
      await page.goto(`/?scene=${scene.id}&backend=${backend}`);
      await ready(page);
      await page.waitForTimeout(1000);
      const m = await page.evaluate(() => window.__ORBITAL__!.getMetrics());
      expect(m.backend).toBe(backend === 'webgpu' ? 'WebGPU' : 'WebGL2');
      expect(m.drawCalls).toBeGreaterThan(0);
      expect(m.drawCalls).toBeLessThanOrEqual(150);
      expect(m.triangles).toBeGreaterThan(10000);
      const connection = page.locator('.connection');
      await expect(page).toHaveScreenshot(`${scene.id}-${backend}.png`, {
        mask: [connection],
        animations: 'disabled',
      });
      await mkdir('artifacts/session-01', { recursive: true });
      await page.screenshot({ path: `artifacts/session-01/${scene.id}-${backend}.png` });
      await writeFile(
        `artifacts/session-01/${scene.id}-${backend}-smoke.json`,
        JSON.stringify({ kind: 'smoke-not-performance-acceptance', metrics: m }, null, 2),
      );
      expect(errors).toEqual([]);
    });
  }
