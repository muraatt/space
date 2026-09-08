import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const frontend = process.env.PRODUCTION_BASE_URL?.replace(/\/$/, '');
const authority = process.env.PRODUCTION_AUTHORITY_URL?.replace(/\/$/, '');
if (!frontend || !authority) {
  throw new Error('PRODUCTION_BASE_URL and PRODUCTION_AUTHORITY_URL are required');
}

const output = 'artifacts/shared-phase-00/production';
await mkdir(output, { recursive: true });
const suffix = Date.now().toString(36).slice(-7).toUpperCase();
const callsignA = `P0A_${suffix}`.slice(0, 20),
  callsignB = `P0B_${suffix}`.slice(0, 20);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const contextA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const contextB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const pageA = await contextA.newPage(),
  pageB = await contextB.newPage();
const gameUrl = `${frontend}/?scene=bounty_sandbox&backend=webgl2&shared=1`;

const state = (page) => page.evaluate(() => globalThis.window.__ORBITAL__?.getState());
const waitForWorld = async (page) => {
  await page.waitForFunction(() => !!globalThis.window.__ORBITAL__?.getState(), undefined, {
    timeout: 90_000,
  });
};
const register = async (page, callsign) => {
  await page.goto(gameUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.getByTestId('identity-gate').waitFor({ state: 'visible', timeout: 90_000 });
  await page.getByTestId('callsign-input').fill(callsign);
  await page.getByTestId('register-identity').click();
  await page.getByTestId('identity-gate').waitFor({ state: 'hidden', timeout: 90_000 });
  await waitForWorld(page);
};
const waitRemote = async (page, shipId) => {
  await page.waitForFunction(
    (id) => globalThis.window.__ORBITAL__?.getState()?.remotePlayers.some((item) => item.shipId === id),
    shipId,
    { timeout: 30_000 },
  );
};
const thrust = async (page) => {
  await page.getByRole('button', { name: 'KUMANDAYI DEVRAL' }).click();
  await page.keyboard.down('w');
  await page.waitForTimeout(700);
  await page.keyboard.up('w');
};

const results = {
  frontend,
  authority,
  browser: 'Chrome / Playwright',
  viewport: '1440x900',
  callsigns: [callsignA, callsignB],
  registrationA: false,
  registrationB: false,
  distinctPlayerIds: false,
  distinctShipIds: false,
  sameWorld: false,
  mutualVisibility: false,
  movementObservedBothDirections: false,
  ownershipRejection: '',
  refreshIdentityRestore: false,
  callsignLocked: false,
  noDuplicateStarterShip: false,
  reconnect: false,
  restartPersistence: false,
};

try {
  const health = await globalThis.fetch(`${authority.replace(/^wss:/, 'https:')}/health`);
  if (!health.ok || (await health.json()).persistence !== 'postgres-identity') {
    throw new Error('Production authority health does not report postgres-identity');
  }

  await register(pageA, callsignA);
  results.registrationA = true;
  await register(pageB, callsignB);
  results.registrationB = true;

  const a = await state(pageA),
    b = await state(pageB);
  if (!a || !b) throw new Error('Missing authoritative state after registration');
  results.distinctPlayerIds = a.profile.playerId !== b.profile.playerId;
  results.distinctShipIds = a.ship.id !== b.ship.id;
  await waitRemote(pageA, b.ship.id);
  await waitRemote(pageB, a.ship.id);
  const sharedA = await state(pageA),
    sharedB = await state(pageB);
  results.sameWorld =
    sharedA.remotePlayers.some((item) => item.shipId === b.ship.id) &&
    sharedB.remotePlayers.some((item) => item.shipId === a.ship.id);
  results.mutualVisibility =
    results.sameWorld &&
    (await pageA.locator(`[data-testid="orbit-map-remote-${b.ship.id}"]`).isVisible()) &&
    (await pageB.locator(`[data-testid="orbit-map-remote-${a.ship.id}"]`).isVisible());

  const aFuel = a.ship.mass.propellantKg,
    bFuel = b.ship.mass.propellantKg;
  await thrust(pageA);
  await pageB.waitForFunction(
    ({ id, fuel }) =>
      globalThis.window.__ORBITAL__?.getState()?.remotePlayers.find((item) => item.shipId === id)?.ship.mass
        .propellantKg < fuel,
    { id: a.ship.id, fuel: aFuel },
    { timeout: 15_000 },
  );
  if ((await state(pageB)).ship.mass.propellantKg !== bFuel) throw new Error('A changed B ship state');
  await thrust(pageB);
  await pageA.waitForFunction(
    ({ id, fuel }) =>
      globalThis.window.__ORBITAL__?.getState()?.remotePlayers.find((item) => item.shipId === id)?.ship.mass
        .propellantKg < fuel,
    { id: b.ship.id, fuel: bFuel },
    { timeout: 15_000 },
  );
  results.movementObservedBothDirections = true;

  const bFuelBeforeForgery = (await state(pageB)).ship.mass.propellantKg;
  results.ownershipRejection = await pageA.evaluate(
    async ({ socketOrigin, foreignShipId }) =>
      new Promise((resolve, reject) => {
        const credential = globalThis.localStorage.getItem('orbital.identity.credential.v1');
        if (!credential) {
          reject(new Error('missing credential'));
          return;
        }
        const socket = new globalThis.WebSocket(`${socketOrigin}/socket?scene=bounty_sandbox&shared=1`);
        const timeout = setTimeout(() => {
          socket.close();
          reject(new Error('ownership timeout'));
        }, 10_000);
        socket.onmessage = (event) => {
          const message = JSON.parse(event.data);
          if (message.type === 'identity_required')
            socket.send(JSON.stringify({ type: 'resume_identity', version: 1, credential }));
          if (message.type === 'identity_established')
            socket.send(
              JSON.stringify({
                type: 'input',
                version: 1,
                shipId: foreignShipId,
                seq: 999,
                translation: [0, 0, -1],
                rotation: [0, 0, 0],
              }),
            );
          if (message.type === 'error') {
            globalThis.clearTimeout(timeout);
            socket.close();
            resolve(message.code ?? '');
          }
        };
      }),
    { socketOrigin: authority, foreignShipId: b.ship.id },
  );
  await pageB.waitForTimeout(500);
  if (
    results.ownershipRejection !== 'NOT_OWNER' ||
    Math.abs((await state(pageB)).ship.mass.propellantKg - bFuelBeforeForgery) > 1e-6
  ) {
    throw new Error('Foreign ownership command was not rejected cleanly');
  }

  const beforeRefresh = await state(pageA);
  await pageA.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 });
  await pageA.getByTestId('identity-gate').waitFor({ state: 'hidden', timeout: 90_000 });
  await waitForWorld(pageA);
  await waitRemote(pageB, beforeRefresh.ship.id);
  const afterRefresh = await state(pageA);
  results.refreshIdentityRestore =
    afterRefresh.profile.playerId === beforeRefresh.profile.playerId &&
    afterRefresh.ship.id === beforeRefresh.ship.id;
  results.callsignLocked =
    (await pageA.getByTestId('callsign-input').count()) === 0 &&
    (await pageA.locator('body').innerText()).includes(callsignA);
  results.noDuplicateStarterShip =
    afterRefresh.profile.ownedShipIds.length === 1 && afterRefresh.hangar.ships.length === 1;

  await contextA.setOffline(true);
  await pageA.waitForTimeout(1_500);
  await contextA.setOffline(false);
  await pageA.waitForFunction(
    ({ playerId, shipId }) => {
      const current = globalThis.window.__ORBITAL__?.getState();
      return current?.profile.playerId === playerId && current.ship.id === shipId;
    },
    { playerId: beforeRefresh.profile.playerId, shipId: beforeRefresh.ship.id },
    { timeout: 90_000 },
  );
  results.reconnect = true;
  await waitRemote(pageB, beforeRefresh.ship.id);
  await pageA.screenshot({ path: `${output}/two-player-production.png` });

  process.stdout.write('READY_FOR_RENDER_RESTART\n');
  const healthUrl = `${authority.replace(/^wss:/, 'https:')}/health`;
  let sawRestart = false,
    healthyAgain = false;
  const restartDeadline = Date.now() + 240_000;
  while (Date.now() < restartDeadline) {
    try {
      const response = await globalThis.fetch(healthUrl, { cache: 'no-store' });
      if (!response.ok) sawRestart = true;
      else if (sawRestart) {
        healthyAgain = true;
        break;
      }
    } catch {
      sawRestart = true;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!sawRestart || !healthyAgain) throw new Error('Render restart was not observed');
  await pageA.waitForFunction(
    ({ playerId, shipId }) => {
      const current = globalThis.window.__ORBITAL__?.getState();
      return current?.profile.playerId === playerId && current.ship.id === shipId;
    },
    { playerId: beforeRefresh.profile.playerId, shipId: beforeRefresh.ship.id },
    { timeout: 90_000 },
  );
  await pageB.waitForFunction(
    ({ playerId, shipId }) => {
      const current = globalThis.window.__ORBITAL__?.getState();
      return current?.profile.playerId === playerId && current.ship.id === shipId;
    },
    { playerId: b.profile.playerId, shipId: b.ship.id },
    { timeout: 90_000 },
  );
  results.restartPersistence = true;
  await waitRemote(pageA, b.ship.id);
  await waitRemote(pageB, a.ship.id);
  await writeFile(`${output}/results.json`, `${JSON.stringify(results, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
} finally {
  await browser.close();
}
