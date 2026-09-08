import { expect, test } from '@playwright/test';
import { ready, reset } from '../src/runner';
import { orbitDay } from '../src/scenarios/orbit_day';
import { cargoMission } from '../src/scenarios/cargo_mission';

test('canvas click enables every flight axis; Space, UI focus and refocus release keys safely', async ({ page, request }) => {
  await reset(request, { ...orbitDay, paused: false });
  await page.goto('/?scene=orbit_day&backend=webgl2');
  await ready(page);
  const canvas = page.getByLabel('Uçuş görünümü');
  await canvas.click({ position: { x: 1050, y: 510 } });
  await expect(page.locator('.strip-status')).toContainText('KUMANDA ETKİN');
  for (const [key, kind, index, expected] of [
    ['w', 'translation', 2, -1], ['s', 'translation', 2, 1],
    ['a', 'translation', 0, -1], ['d', 'translation', 0, 1],
    ['r', 'translation', 1, 1], ['f', 'translation', 1, -1],
    ['ArrowUp', 'rotation', 0, 1], ['ArrowDown', 'rotation', 0, -1],
    ['ArrowLeft', 'rotation', 1, 1], ['ArrowRight', 'rotation', 1, -1],
    ['q', 'rotation', 2, 1], ['e', 'rotation', 2, -1],
  ] as const) {
    await page.keyboard.down(key);
    await expect.poll(() => page.evaluate(([axis, component]) =>
      window.__ORBITAL__!.getState()!.controls[axis][component], [kind, index] as const)).toBe(expected);
    await page.keyboard.up(key);
    await expect.poll(() => page.evaluate(([axis, component]) =>
      window.__ORBITAL__!.getState()!.controls[axis][component], [kind, index] as const)).toBe(0);
  }
  await page.keyboard.down('w');
  await expect.poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.controls.translation[2])).toBe(-1);
  await page.keyboard.press('Space');
  await page.keyboard.down('w'); // held key repeat must not restart thrust after Space
  await expect.poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.controls.translation[2])).toBe(0);
  await page.keyboard.up('w');
  await page.getByRole('button', { name: 'HANGAR VE SERVİS' }).click();
  await expect(page.getByLabel('Hangar ve servisler')).toBeVisible();
  await page.keyboard.down('w');
  await page.keyboard.press('Escape');
  await page.keyboard.up('w');
  await expect(page.getByLabel('Hangar ve servisler')).toBeHidden();
  await page.keyboard.down('w');
  await expect.poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.controls.translation[2])).toBe(-1);
  await page.keyboard.up('w');
});

test('all panels and help/source dialogs remain clickable at 720p without click-through', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await reset(request, { ...orbitDay, paused: false });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?backend=webgl2');
  await ready(page);
  for (const [button, panel] of [
    ['MANEVRA BİLGİSAYARI', 'Manevra bilgisayarı'],
    ['GÖREV KONTROLÜ', 'Görev kontrolü'],
    ['HANGAR VE SERVİS', 'Hangar ve servisler'],
    ['ATEŞ KONTROLÜ', 'Savaş kontrolü'],
  ]) {
    await page.getByRole('button', { name: button }).click();
    await expect(page.getByLabel(panel, { exact: true })).toBeVisible();
    await page.getByLabel(panel, { exact: true }).getByRole('button', { name: /kapat/i }).click();
    await expect(page.getByLabel(panel, { exact: true })).toBeHidden();
    await page.keyboard.down('w');
    await expect.poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.controls.translation[2])).toBe(-1);
    await page.keyboard.up('w');
  }
  await page.getByRole('button', { name: /KONTROLLER/ }).click();
  const guide = page.getByRole('dialog', { name: 'Uçuş kontrolleri' });
  await expect(guide).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(guide.getByRole('button', { name: 'Kapat', exact: true })).toBeFocused();
  await guide.getByRole('button', { name: 'Kapat', exact: true }).click();
  await page.getByRole('button', { name: 'KAYNAKLAR', exact: true }).click();
  await page.getByRole('dialog', { name: 'Kaynaklar', exact: true }).getByRole('button', { name: 'Kapat' }).click();
  await page.keyboard.press('F3');
  await expect(page.getByLabel('Debug telemetri')).toBeVisible();
  await page.keyboard.press('F3');
  await expect(page.getByLabel('Debug telemetri')).toBeHidden();
  expect(errors).toEqual([]);
});

test('reclaim after another tab preserves its current profile and restores real keyboard control', async ({ page, context, request }) => {
  await reset(request, { ...orbitDay, paused: false });
  await page.goto('/?backend=webgl2');
  await ready(page);
  const other = await context.newPage();
  await other.goto('/?scene=cargo_mission&backend=webgl2');
  await ready(other);
  await other.getByTestId('faction-aurora').click();
  await expect(other.getByLabel('Pilot profili')).toContainText('Aurora');
  const before = await other.evaluate(() => window.__ORBITAL__!.getState()!.profile);
  await expect(page.getByRole('alert')).toContainText('Kumanda başka sekmede');
  await page.getByRole('button', { name: 'KUMANDAYI DEVRAL' }).click();
  await expect(page.locator('.connection')).toContainText('Bağlı');
  await expect(page.locator('.strip-status')).toContainText('KUMANDA ETKİN');
  await expect.poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.profile.factionId)).toBe(before.factionId);
  expect(await page.evaluate(() => window.__ORBITAL__!.getState()!.profile.credits)).toBe(before.credits);
  await page.keyboard.down('w');
  await expect.poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.controls.translation[2])).toBe(-1);
  await page.keyboard.up('w');
  await other.close();
});

test('disconnected action receives feedback and reconnect does not leave a pending button stuck', async ({ page, request }) => {
  let disconnect: (() => Promise<void>) | undefined;
  await page.routeWebSocket('**/socket?*', socket => {
    socket.connectToServer();
    disconnect = () => socket.close({ code: 1011, reason: 'Regression connection loss' });
  });
  await reset(request, cargoMission);
  await page.goto('/?scene=cargo_mission&backend=webgl2');
  await ready(page);
  await page.getByTestId('faction-aurora').click();
  await expect(page.getByLabel('Pilot profili')).toContainText('Aurora');
  await disconnect!();
  await expect(page.locator('.connection')).not.toContainText('Bağlı');
  await page.getByRole('button', { name: 'YENİLE', exact: true }).click();
  await expect(page.getByRole('button', { name: 'YENİLE', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Görev panelini kapat' }).click();
  await page.getByRole('button', { name: 'KUMANDAYI DEVRAL' }).click();
  await expect(page.locator('.connection')).toContainText('Bağlı');
  await page.getByRole('button', { name: 'GÖREV KONTROLÜ' }).click();
  await page.getByRole('button', { name: 'YENİLE', exact: true }).click();
  await expect(page.getByTestId('mission-cargo')).toHaveCount(2);
});
