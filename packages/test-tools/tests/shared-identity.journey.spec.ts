import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('two independent identities share authoritative ships and reconnect without duplication', async ({ browser }) => {
  test.setTimeout(90_000);
  const startedAt = Date.now();
  const evidence = process.env.UPDATE_ACCEPTED_EVIDENCE === '1'
    ? 'artifacts/shared-phase-00'
    : '.runs/playwright/shared-identity';
  await mkdir(evidence, { recursive: true });
  const suffix = Date.now().toString(36).slice(-7).toUpperCase(),
    callsignA = `ALPHA_${suffix}`.slice(0, 20), callsignB = `BRAVO_${suffix}`.slice(0, 20);
  const contextA = await browser.newContext({ viewport: { width: 1440, height: 900 } }),
    contextB = await browser.newContext({ viewport: { width: 1440, height: 900 } }),
    pageA = await contextA.newPage(), pageB = await contextB.newPage();
  await pageA.goto('/?scene=bounty_sandbox&backend=webgl2&shared=1');
  await expect(pageA.getByTestId('identity-gate')).toBeVisible();
  await pageA.screenshot({ path: `${evidence}/01-registration.png` });
  await pageA.getByTestId('callsign-input').fill(callsignA);
  await pageA.getByTestId('register-identity').click();
  await expect(pageA.getByTestId('identity-gate')).toBeHidden({ timeout: 15_000 });

  await pageB.goto('/?scene=bounty_sandbox&backend=webgl2&shared=1');
  await pageB.getByTestId('callsign-input').fill(callsignB);
  await pageB.getByTestId('register-identity').click();
  await expect(pageB.getByTestId('identity-gate')).toBeHidden({ timeout: 15_000 });
  await expect.poll(() => pageA.evaluate(() => window.__ORBITAL__?.getState()?.remotePlayers.length)).toBe(1);
  await expect.poll(() => pageB.evaluate(() => window.__ORBITAL__?.getState()?.remotePlayers.length)).toBe(1);
  const identityA = await pageA.evaluate(() => ({
    shipId: window.__ORBITAL__!.getState()!.ship.id,
    own: window.__ORBITAL__!.getState()!.ship.position,
    propellant: window.__ORBITAL__!.getState()!.ship.mass.propellantKg,
    remote: window.__ORBITAL__!.getState()!.remotePlayers[0],
  }));
  const identityB = await pageB.evaluate(() => ({
    shipId: window.__ORBITAL__!.getState()!.ship.id,
    own: window.__ORBITAL__!.getState()!.ship.position,
    propellant: window.__ORBITAL__!.getState()!.ship.mass.propellantKg,
    remote: window.__ORBITAL__!.getState()!.remotePlayers[0],
  }));
  expect(identityA.shipId).not.toBe(identityB.shipId);
  expect(identityA.remote.shipId).toBe(identityB.shipId);
  expect(identityB.remote.shipId).toBe(identityA.shipId);
  expect(identityA.own).not.toEqual(identityB.own);

  await pageA.getByRole('button', { name: 'KUMANDAYI DEVRAL' }).click();
  await pageA.keyboard.down('w'); await pageA.waitForTimeout(700); await pageA.keyboard.up('w');
  const movedA = await expect.poll(() => pageB.evaluate((shipId) => {
    const ship = window.__ORBITAL__!.getState()!.remotePlayers.find((item) => item.shipId === shipId)?.ship;
    return ship?.mass.propellantKg;
  }, identityA.shipId)).not.toBeUndefined().then(() => pageB.evaluate((shipId) => window.__ORBITAL__!.getState()!.remotePlayers.find((item) => item.shipId === shipId)!.ship.mass.propellantKg, identityA.shipId));
  expect(movedA).toBeLessThan(identityA.propellant);
  expect(await pageB.evaluate(() => window.__ORBITAL__!.getState()!.ship.mass.propellantKg)).toBe(identityB.propellant);
  await pageB.getByRole('button', { name: 'KUMANDAYI DEVRAL' }).click();
  await pageB.keyboard.down('w'); await pageB.waitForTimeout(700); await pageB.keyboard.up('w');
  await expect.poll(() => pageA.evaluate((shipId) => window.__ORBITAL__!.getState()!.remotePlayers.find((item) => item.shipId === shipId)?.ship.mass.propellantKg, identityB.shipId)).toBeLessThan(identityB.propellant);
  await pageB.waitForTimeout(300);
  const bFuelBeforeAttack = await pageB.evaluate(() => window.__ORBITAL__!.getState()!.ship.mass.propellantKg);

  await pageA.getByLabel('Operasyon paneli').getByRole('button', { name: /OPS/ }).click();
  await expect(pageA.getByTestId('shared-pilots')).toContainText(callsignB);
  await expect(pageA.locator('[data-testid^="orbit-map-remote-"]')).toHaveCount(1);
  await pageA.screenshot({ path: `${evidence}/02-two-player-hud.png` });
  const metrics = await pageA.evaluate(() => window.__ORBITAL__!.getMetrics());
  const foreignCommandResult = await pageA.evaluate(async (foreignShipId) => new Promise<string>((resolve, reject) => {
    const credential = localStorage.getItem('orbital.identity.credential.v1');
    if (!credential) { reject(new Error('missing credential')); return; }
    const socket = new WebSocket(`ws://${location.host}/socket?scene=bounty_sandbox&shared=1`);
    const timeout = setTimeout(() => { socket.close(); reject(new Error('ownership timeout')); }, 5_000);
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data as string) as { type: string; code?: string };
      if (message.type === 'identity_required') socket.send(JSON.stringify({ type: 'resume_identity', version: 1, credential }));
      if (message.type === 'identity_established') socket.send(JSON.stringify({
        type: 'input', version: 1, shipId: foreignShipId, seq: 999,
        translation: [0, 0, -1], rotation: [0, 0, 0],
      }));
      if (message.type === 'error') { clearTimeout(timeout); socket.close(); resolve(message.code ?? ''); }
    };
  }), identityB.shipId);
  expect(foreignCommandResult).toBe('NOT_OWNER');
  await pageB.waitForTimeout(300);
  expect(await pageB.evaluate(() => window.__ORBITAL__!.getState()!.ship.mass.propellantKg)).toBeCloseTo(bFuelBeforeAttack, 6);

  const beforeReload = await pageA.evaluate(() => window.__ORBITAL__!.getState()!.ship.id);
  await pageA.reload();
  await expect(pageA.getByTestId('identity-gate')).toBeHidden({ timeout: 15_000 });
  await expect.poll(() => pageA.evaluate(() => window.__ORBITAL__?.getState()?.ship.id)).toBe(beforeReload);
  await expect.poll(() => pageB.evaluate(() => window.__ORBITAL__?.getState()?.remotePlayers.length)).toBe(1);
  await pageB.goto('about:blank');
  await expect.poll(() => pageA.evaluate(() => window.__ORBITAL__?.getState()?.remotePlayers.length)).toBe(0);
  await expect(pageA.locator('[data-testid^="orbit-map-remote-"]')).toHaveCount(0);
  // Refresh resets the expanded panel; real UI controls expose the offline policy.
  await pageA.getByLabel('Operasyon paneli').getByRole('button', { name: /OPS/ }).click();
  await expect(pageA.getByTestId('shared-pilots')).not.toContainText(callsignB);
  await pageA.screenshot({ path: `${evidence}/03-offline-hidden.png` });
  await writeFile(`${evidence}/two-client-results.json`, JSON.stringify({
    browser: 'Chrome / Playwright', viewport: '1440x900', backend: metrics.backend,
    drawCalls: metrics.drawCalls, triangles: metrics.triangles, frameMs: metrics.frameMs,
    rttMs: metrics.rttMs, players: 2, distinctShips: true, movementObservedBothDirections: true,
    ownershipRejection: foreignCommandResult, reconnectRestoredShip: true, duplicateShipCountAfterReconnect: 0,
    offlineSpatialHidden: true, durationMs: Date.now() - startedAt,
  }, null, 2));
  await Promise.all([contextA.close(), contextB.close()]);
});
