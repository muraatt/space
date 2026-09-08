import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { ready, reset, TEST_HEADERS, TEST_SERVER } from '../src/runner';
import { bountySandbox } from '../src/scenarios/bounty_sandbox';

const evidence = 'artifacts/bounty-phase-02';

async function advanceCoast(page: Page, request: Parameters<typeof reset>[0]) {
  const serverStatus = async () => {
    const response = await request.get(`${TEST_SERVER}/__test/state`, { headers: TEST_HEADERS });
    return (await response.json()).maneuver?.status as string | undefined;
  };
  for (let event = 0; event < 3; event++) {
    const status = await expect.poll(
      serverStatus,
      { timeout: 45_000 },
    ).toMatch(/COASTING|COMPLETE/).then(serverStatus);
    if (status === 'COMPLETE') return;
    const response = await request.post(`${TEST_SERVER}/__test/advance-maneuver`, { headers: TEST_HEADERS });
    expect(response.ok()).toBe(true);
    await expect.poll(
      serverStatus,
      { timeout: 5_000 },
    ).not.toBe('COASTING');
  }
  await expect.poll(
    serverStatus,
    { timeout: 45_000 },
  ).toBe('COMPLETE');
  await expect.poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.maneuver?.status)).toBe('COMPLETE');
}

async function executeFast(page: Page, request: Parameters<typeof reset>[0]) {
  const planner = page.getByLabel('Manevra bilgisayarı');
  await planner.getByRole('button', { name: 'MANEVRA SEÇENEKLERİNİ HESAPLA' }).click();
  const fast = page.getByTestId('candidate-fast');
  const candidate = await fast.isVisible() ? fast : page.getByTestId('candidate-economic');
  await expect(candidate).toBeVisible({ timeout: 15_000 });
  await candidate.click();
  await page.getByTestId('execute-maneuver').click();
  await advanceCoast(page, request);
}

async function pulse(page: Page, key: 'w' | 's', milliseconds: number) {
  await page.keyboard.down(key);
  await page.waitForTimeout(milliseconds);
  await page.keyboard.up(key);
}

test('complete one orbital bounty loop and accept a second without reset or reload', async ({ page, request }) => {
  test.setTimeout(300_000);
  await mkdir(evidence, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await reset(request, bountySandbox);
  await page.goto('/?scene=bounty_sandbox&backend=webgl2');
  await ready(page);
  expect(await page.evaluate(() => window.__ORBITAL__!.getState()!.docking.phase)).toBe('DOCKED');

  await page.getByRole('button', { name: 'GÖREV KONTROLÜ' }).click();
  const missions = page.getByLabel('Görev kontrolü');
  await missions.getByRole('button', { name: 'YENİLE' }).click();
  await expect(page.getByTestId('mission-bounty')).toHaveCount(3, { timeout: 20_000 });
  await page.screenshot({ path: `${evidence}/01-bounty-board.png` });
  const scout = page.getByTestId('mission-bounty').filter({ hasText: 'SCOUT' });
  await scout.getByRole('button', { name: 'BOUNTY KABUL ET' }).click();
  await expect(page.getByTestId('bounty-progress')).toContainText('INTERCEPT REQUIRED');
  await page.getByRole('button', { name: 'Görev panelini kapat' }).click();

  const ops = page.getByLabel('Operasyon paneli');
  await ops.getByRole('button', { name: /OPS/ }).click();
  await expect(page.getByTestId('ops-contract')).toContainText('SCOUT');
  await page.getByTestId('undock').click();
  const frameStart = await page.evaluate(() => window.__ORBITAL__!.getFrameTimes().length);
  await page.waitForTimeout(3_000);
  const performance = await page.evaluate((from) => {
    const frames = window.__ORBITAL__!.getFrameTimes().slice(from).sort((a, b) => a - b),
      metrics = window.__ORBITAL__!.getMetrics();
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
      bountyContacts: window.__ORBITAL__!.getState()!.combat.contacts.filter((item) => item.bountyClass).length,
    };
  }, frameStart);
  await writeFile(`${evidence}/performance.json`, `${JSON.stringify(performance, null, 2)}\n`);
  await page.screenshot({ path: `${evidence}/02-active-hunt.png` });
  await page.getByRole('button', { name: 'GÖREV KONTROLÜ' }).click();
  await page.getByRole('button', { name: 'HEDEFİ MANEVRAYA AKTAR' }).click();
  await expect(page.getByLabel('Manevra bilgisayarı').locator('select')).toHaveValue('bounty-target-scout-01');
  await executeFast(page, request);
  await page.getByRole('button', { name: 'Manevra panelini kapat' }).click();

  await page.getByRole('button', { name: 'GÖREV KONTROLÜ' }).click();
  await expect(page.getByTestId('bounty-progress')).toContainText('ACQUISITION READY');
  await page.getByTestId('identify-target').click();
  await expect(page.getByTestId('bounty-progress')).toContainText('FIRE AUTHORIZED');
  await page.getByRole('button', { name: 'Görev panelini kapat' }).click();
  await page.getByRole('button', { name: 'ATEŞ KONTROLÜ' }).click();
  await page.getByTestId('select-target').click();
  await page.screenshot({ path: `${evidence}/03-target-acquired.png` });
  const fire = page.getByTestId('laser-weapon').getByRole('button', { name: 'LAZER ATEŞLE' });
  const missile = page.getByTestId('missile-weapon').getByRole('button', { name: 'FÜZE FIRLAT' });
  if (await missile.isEnabled()) await missile.click();
  for (let step = 0; step < 80; step++) {
    if (await page.evaluate(() => window.__ORBITAL__!.getState()!.combat.contacts.find((item) => item.id === 'bounty-target-scout-01')!.destroyed)) break;
    await fire.evaluate((button: HTMLButtonElement) => { if (!button.disabled) button.click(); });
    await page.waitForTimeout(150);
  }
  await expect.poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.missions.find((item) => item.bounty?.targetId === 'bounty-target-scout-01')?.status), { timeout: 15_000 }).toBe('COMPLETED');
  await page.getByRole('button', { name: 'Savaş panelini kapat' }).click();

  await page.getByRole('button', { name: 'GÖREV KONTROLÜ' }).click();
  await expect(page.getByTestId('bounty-result')).toContainText('NET');
  await page.screenshot({ path: `${evidence}/04-bounty-result.png` });
  await page.getByTestId('bounty-result').getByRole('button', { name: "AEGIS'İ HEDEFLE" }).click();
  await page.getByRole('button', { name: 'MANEVRA BİLGİSAYARI' }).click();
  await expect(page.getByLabel('Manevra bilgisayarı').locator('select')).toHaveValue('aegis-service-01');
  await executeFast(page, request);
  await page.getByRole('button', { name: 'Manevra panelini kapat' }).click();

  const canvas = page.getByLabel('Uçuş görünümü');
  await canvas.click({ position: { x: 900, y: 420 } });
  for (let i = 0; i < 260; i++) {
    const metrics = await page.evaluate(() => window.__ORBITAL__!.getState()!.docking.metrics!);
    if (metrics.rangeM <= 3.2 && metrics.relativeSpeedMps <= 0.9) break;
    if (metrics.rangeM > 30) await pulse(page, metrics.closingSpeedMps < 4 ? 'w' : 's', 80);
    else if (metrics.closingSpeedMps > 0.65) await pulse(page, 's', 70);
    else await pulse(page, 'w', 45);
    await page.waitForTimeout(70);
  }
  if (!(await page.getByTestId('request-dock').isVisible())) {
    await ops.getByRole('button', { name: /OPS/ }).click();
  }
  await page.getByTestId('request-dock').click();
  await expect.poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.docking.phase)).toBe('DOCKED');
  await page.getByTestId('station-services').click();
  await expect(page.getByLabel('Hangar ve servisler')).toContainText('AEGIS / DOCKED');
  const fuel = page.getByTestId('fuel-service').getByRole('button', { name: 'YAKITI TAMAMLA' });
  if (await fuel.isEnabled()) await fuel.click();
  const ammo = page.getByTestId('ammo-service').getByRole('button', { name: 'MÜHİMMATI TAMAMLA' });
  if (await ammo.isEnabled()) await ammo.click();
  const repair = page.getByTestId('repair-service').getByRole('button', { name: 'ARACI ONAR' });
  if (await repair.isEnabled()) await repair.click();
  await page.getByRole('button', { name: 'Hangarı kapat' }).click();

  await page.getByRole('button', { name: 'GÖREV KONTROLÜ' }).click();
  const fighter = page.getByTestId('mission-bounty').filter({ hasText: 'FIGHTER' });
  await fighter.getByRole('button', { name: 'BOUNTY KABUL ET' }).click();
  await expect(page.getByTestId('bounty-progress')).toContainText('ROGUE F-17');
  expect(errors).toEqual([]);
});
