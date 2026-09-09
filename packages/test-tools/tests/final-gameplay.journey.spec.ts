import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import type { WorldState } from '@orbital/shared';
import { cross, dot, normalize, stationPortWorld, sub } from '@orbital/simulation';
import { ready, TEST_HEADERS, TEST_SERVER } from '../src/runner';

const evidence = '.runs/playwright/pass4-final';

async function register(page: Page) {
  const callsign = `FINAL_${Date.now().toString(36).slice(-8).toUpperCase()}`.slice(0, 20);
  await page.goto('/?scene=orbit_night&backend=webgl2&shared=1');
  await page.getByTestId('callsign-input').fill(callsign);
  await page.getByTestId('register-identity').click();
  await expect(page.getByTestId('identity-gate')).toBeHidden({ timeout: 15_000 });
  await ready(page);
  return callsign;
}

async function serverState(request: APIRequestContext, playerId: string) {
  const response = await request.get(`${TEST_SERVER}/__test/state?playerId=${encodeURIComponent(playerId)}`, {
    headers: TEST_HEADERS,
  });
  expect(response.ok()).toBe(true);
  return response.json() as Promise<WorldState>;
}

async function advanceCoast(page: Page, request: APIRequestContext, playerId: string) {
  const status = async () => (await serverState(request, playerId)).maneuver?.status as string | undefined;
  for (let event = 0; event < 4; event += 1) {
    const current = await expect.poll(status, { timeout: 45_000 }).toMatch(/COASTING|COMPLETE|FAILED/).then(status);
    if (current === 'FAILED') {
      const failed = (await serverState(request, playerId)).maneuver;
      throw new Error(`Authoritative maneuver failed: ${JSON.stringify(failed)}`);
    }
    if (current === 'COMPLETE') break;
    const response = await request.post(
      `${TEST_SERVER}/__test/advance-maneuver?playerId=${encodeURIComponent(playerId)}`,
      { headers: TEST_HEADERS },
    );
    expect(response.ok()).toBe(true);
    await expect.poll(status, { timeout: 8_000 }).not.toBe('COASTING');
  }
  await expect.poll(status, { timeout: 45_000 }).toBe('COMPLETE');
  await expect.poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.maneuver?.status)).toBe('COMPLETE');
}

async function executeFast(page: Page, request: APIRequestContext, playerId: string) {
  const planner = page.getByLabel('Manevra bilgisayarı');
  await planner.getByRole('button', { name: 'MANEVRA SEÇENEKLERİNİ HESAPLA' }).click();
  const fast = page.getByTestId('candidate-fast'), economic = page.getByTestId('candidate-economic');
  await expect(fast.or(economic).first()).toBeVisible({ timeout: 20_000 });
  if (await fast.isVisible()) await fast.click();
  else await economic.click();
  await page.getByTestId('execute-maneuver').click();
  await advanceCoast(page, request, playerId);
}

async function captureAtAegis(page: Page, request: APIRequestContext, playerId: string) {
  const canvas = page.getByLabel('Uçuş görünümü');
  await canvas.click({ position: { x: 900, y: 420 } });
  type FlightKey = 'w' | 's' | 'a' | 'd' | 'r' | 'f';
  const held = new Set<FlightKey>();
  for (let step = 0; step < 1_600; step += 1) {
    const state = await serverState(request, playerId), metrics = state.docking.metrics!,
      port = stationPortWorld(state.station, state.station.ports[0]),
      offset = sub(state.ship.position, port.position), relativeVelocity = sub(state.ship.velocity, state.station.velocity),
      right = normalize(cross(port.upAxis, port.approachAxis)),
      lateral = dot(offset, right), lateralSpeed = dot(relativeVelocity, right),
      vertical = dot(offset, port.upAxis), verticalSpeed = dot(relativeVelocity, port.upAxis),
      axialSpeed = dot(relativeVelocity, port.approachAxis);
    if (metrics.rangeM <= 3.2 && metrics.relativeSpeedMps <= 0.9 && metrics.lateralErrorM <= 2.5) break;
    const targetAxialSpeed = metrics.axialDistanceM < 0 ? 1
        : metrics.axialDistanceM > 120 ? -6
          : metrics.axialDistanceM > 50 ? -4
            : metrics.axialDistanceM > 15 ? -1.2
              : metrics.axialDistanceM > 3 ? -0.3 : -0.05,
      targetLateralSpeed = Math.max(-4, Math.min(4, -lateral * 0.12)),
      targetVerticalSpeed = Math.max(-4, Math.min(4, -vertical * 0.12)),
      keys = new Set<FlightKey>();
    if (axialSpeed > targetAxialSpeed + 0.2) keys.add('w');
    else if (axialSpeed < targetAxialSpeed - 0.2) keys.add('s');
    if (lateralSpeed > targetLateralSpeed + 0.15) keys.add('a');
    else if (lateralSpeed < targetLateralSpeed - 0.15) keys.add('d');
    if (verticalSpeed > targetVerticalSpeed + 0.15) keys.add('f');
    else if (verticalSpeed < targetVerticalSpeed - 0.15) keys.add('r');
    for (const key of held) if (!keys.has(key)) { await page.keyboard.up(key); held.delete(key); }
    for (const key of keys) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
    await page.waitForTimeout(50);
  }
  for (const key of held) await page.keyboard.up(key);
  const capture = await page.evaluate(() => window.__ORBITAL__!.getState()!.docking.metrics!);
  expect(capture.rangeM).toBeLessThanOrEqual(3.5);
  expect(capture.relativeSpeedMps).toBeLessThanOrEqual(1);
  const ops = page.getByLabel('Operasyon paneli');
  if (!(await page.getByTestId('request-dock').isVisible())) await ops.getByRole('button', { name: /OPS/ }).click();
  await page.getByTestId('request-dock').click();
  await expect.poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.docking.phase)).toBe('DOCKED');
}

test('registration through full shared authoritative gameplay and identity reconnect', async ({ page, request }) => {
  test.setTimeout(360_000);
  await mkdir(evidence, { recursive: true });
  const errors: string[] = [], startedAt = Date.now();
  page.on('pageerror', (error) => errors.push(error.message));
  const callsign = await register(page);
  const initial = await page.evaluate(() => ({
    playerId: window.__ORBITAL__!.getState()!.profile.playerId,
    shipId: window.__ORBITAL__!.getState()!.ship.id,
    fuel: window.__ORBITAL__!.getState()!.ship.mass.propellantKg,
    position: window.__ORBITAL__!.getState()!.ship.position,
  }));
  expect(initial.playerId).toBeTruthy();
  await expect(page.locator('.scene-caption')).toContainText('Paylaşılan görev alanı');
  await expect(page.getByRole('button', { name: '◐ Gece' })).toHaveCount(0);

  await page.locator('.primary-action').click();
  await page.waitForTimeout(500);
  expect(await page.evaluate((position) => Math.hypot(...window.__ORBITAL__!.getState()!.ship.position
    .map((value, index) => value - position[index])), initial.position)).toBeGreaterThan(1);

  await page.getByRole('button', { name: 'İSTASYONU HEDEFLE' }).click();
  await page.getByRole('button', { name: 'MANEVRA BİLGİSAYARI' }).click();
  await expect(page.getByLabel('Manevra bilgisayarı').locator('select')).toHaveValue('aegis-service-01');
  await executeFast(page, request, initial.playerId);
  await page.getByRole('button', { name: 'Manevra panelini kapat' }).click();
  await captureAtAegis(page, request, initial.playerId);

  const creditsBeforeService = await page.evaluate(() => window.__ORBITAL__!.getState()!.profile.credits);
  await page.getByTestId('station-services').click();
  const fuel = page.getByTestId('fuel-service').getByRole('button', { name: 'YAKITI TAMAMLA' });
  await expect(fuel).toBeEnabled();
  await fuel.click();
  await expect.poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.profile.credits)).toBeLessThan(creditsBeforeService);
  await page.getByRole('button', { name: 'Hangarı kapat' }).click();

  await page.getByRole('button', { name: 'GÖREV KONTROLÜ' }).click();
  await page.getByLabel('Görev kontrolü').getByRole('button', { name: 'YENİLE' }).click();
  const scout = page.getByTestId('mission-bounty').filter({ hasText: 'SCOUT' });
  await expect(scout).toBeVisible({ timeout: 20_000 });
  await scout.getByRole('button', { name: 'BOUNTY KABUL ET' }).click();
  await expect(page.getByTestId('bounty-progress')).toContainText('INTERCEPT REQUIRED');
  await page.getByRole('button', { name: 'Görev panelini kapat' }).click();
  const ops = page.getByLabel('Operasyon paneli');
  if (!(await page.getByTestId('undock').isVisible())) await ops.getByRole('button', { name: /OPS/ }).click();
  await page.getByTestId('undock').click();

  await page.getByRole('button', { name: 'GÖREV KONTROLÜ' }).click();
  await page.getByRole('button', { name: 'HEDEFİ MANEVRAYA AKTAR' }).click();
  await executeFast(page, request, initial.playerId);
  await page.getByRole('button', { name: 'Manevra panelini kapat' }).click();
  await page.getByRole('button', { name: 'GÖREV KONTROLÜ' }).click();
  await expect(page.getByTestId('bounty-progress')).toContainText('ACQUISITION READY');
  await page.getByTestId('identify-target').click();
  await expect(page.getByTestId('bounty-progress')).toContainText('FIRE AUTHORIZED');
  await page.getByRole('button', { name: 'Görev panelini kapat' }).click();

  const damage = await request.post(
    `${TEST_SERVER}/__test/player-damage?playerId=${encodeURIComponent(initial.playerId)}`,
    { headers: TEST_HEADERS, data: { damageId: 'pass4-final-authoritative-hit', amount: 5 } },
  );
  expect(damage.ok()).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.ship.conditionPercent)).toBeLessThan(100);
  const damagedCondition = await page.evaluate(() => window.__ORBITAL__!.getState()!.ship.conditionPercent);

  await page.getByRole('button', { name: 'ATEŞ KONTROLÜ' }).click();
  await page.getByTestId('select-target').click();
  const fire = page.getByTestId('laser-weapon').getByRole('button', { name: 'LAZER ATEŞLE' });
  const missile = page.getByTestId('missile-weapon').getByRole('button', { name: 'FÜZE FIRLAT' });
  if (await missile.isEnabled()) await missile.click();
  for (let shot = 0; shot < 80; shot += 1) {
    const destroyed = await page.evaluate(() => window.__ORBITAL__!.getState()!.combat.contacts
      .find((contact) => contact.id === 'bounty-target-scout-01')?.destroyed);
    if (destroyed) break;
    await fire.evaluate((button: HTMLButtonElement) => { if (!button.disabled) button.click(); });
    await page.waitForTimeout(150);
  }
  await expect.poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.missions
    .find((mission) => mission.bounty?.targetId === 'bounty-target-scout-01')?.status), { timeout: 15_000 }).toBe('COMPLETED');
  await page.getByRole('button', { name: 'Savaş panelini kapat' }).click();

  await page.getByRole('button', { name: 'GÖREV KONTROLÜ' }).click();
  await expect(page.getByTestId('bounty-result')).toContainText('NET');
  await page.screenshot({ path: `${evidence}/01-completed-bounty.png` });
  await page.getByTestId('bounty-result').getByRole('button', { name: "AEGIS'İ HEDEFLE" }).click();
  await page.getByRole('button', { name: 'MANEVRA BİLGİSAYARI' }).click();
  await executeFast(page, request, initial.playerId);
  await page.getByRole('button', { name: 'Manevra panelini kapat' }).click();
  await captureAtAegis(page, request, initial.playerId);

  await page.getByTestId('station-services').click();
  const repair = page.getByTestId('repair-service').getByRole('button', { name: 'ARACI ONAR' });
  await expect(repair).toBeEnabled();
  await repair.click();
  const refuel = page.getByTestId('fuel-service').getByRole('button', { name: 'YAKITI TAMAMLA' });
  if (await refuel.isEnabled()) await refuel.click();
  await page.getByRole('button', { name: 'Hangarı kapat' }).click();
  await page.waitForTimeout(500);
  const beforeReconnect = await page.evaluate(() => ({
    playerId: window.__ORBITAL__!.getState()!.profile.playerId,
    shipId: window.__ORBITAL__!.getState()!.ship.id,
    credits: window.__ORBITAL__!.getState()!.profile.credits,
    condition: window.__ORBITAL__!.getState()!.ship.conditionPercent,
    completed: window.__ORBITAL__!.getState()!.missions.filter((mission) => mission.status === 'COMPLETED').length,
  }));
  await page.reload();
  await expect(page.getByTestId('identity-gate')).toBeHidden({ timeout: 15_000 });
  await expect.poll(() => page.evaluate(() => window.__ORBITAL__?.getState()?.ship.id)).toBe(initial.shipId);
  const restored = await page.evaluate(() => ({
    playerId: window.__ORBITAL__!.getState()!.profile.playerId,
    shipId: window.__ORBITAL__!.getState()!.ship.id,
    credits: window.__ORBITAL__!.getState()!.profile.credits,
    condition: window.__ORBITAL__!.getState()!.ship.conditionPercent,
    completed: window.__ORBITAL__!.getState()!.missions.filter((mission) => mission.status === 'COMPLETED').length,
  }));
  expect(restored).toEqual(beforeReconnect);
  await expect(page.locator('header')).toContainText(callsign);
  await page.screenshot({ path: `${evidence}/02-restored-at-aegis.png` });
  expect(errors).toEqual([]);
  await writeFile(`${evidence}/results.json`, `${JSON.stringify({
    browser: 'Chrome / Playwright', viewport: '1920x1080', identityMode: 'shared',
    registration: true, manualFlight: true, stationRendezvous: true, dockAndService: true,
    bountyAccepted: true, authoritativeDamageObserved: damagedCondition,
    combatCompletionAndReward: true, returnToStation: true, reconnectExactState: true,
    playerId: initial.playerId, shipId: initial.shipId, durationMs: Date.now() - startedAt,
  }, null, 2)}\n`);
});
