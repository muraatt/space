import { expect, test } from '@playwright/test';
import { ready, reset } from '../src/runner';
import { intercept } from '../src/scenarios/intercept';

test('identifies and neutralizes an intercept target through authoritative combat UI', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await reset(request, intercept);
  await page.goto('/?scene=intercept&backend=webgl2');
  await ready(page);
  await page.getByTestId('faction-aurora').click();
  const missions = page.getByLabel('Görev kontrolü');
  await missions.getByRole('button', { name: 'YENİLE' }).click();
  const interceptCard = page.getByTestId('mission-intercept');
  await expect(interceptCard).toBeVisible({ timeout: 10000 });
  await interceptCard.getByRole('button', { name: 'GÖREVİ KABUL ET' }).click();
  await expect(page.getByLabel('Etkin görev')).toContainText('HEDEF MENZİLİNDE');
  await page.getByTestId('identify-target').click();
  await expect(page.getByTestId('intercept-progress')).toContainText('ATEŞ YETKİSİ');

  await page.getByRole('button', { name: 'Görev panelini kapat' }).click();
  await page.getByRole('button', { name: 'ATEŞ KONTROLÜ' }).click();
  const combat = page.getByLabel('Savaş kontrolü');
  await expect(combat).toContainText('NORMAL');
  await expect(page.getByTestId('incoming-missile')).toBeVisible();
  await page.getByTestId('countermeasure').getByRole('button', { name: 'KARŞI TEDBİR' }).click();
  await expect(combat).toContainText('COUNTERMEASURE SUCCESS');
  await page.getByTestId('select-target').click();
  await expect(page.getByTestId('laser-weapon').getByRole('button')).toBeEnabled();
  const missile = page.getByTestId('missile-weapon').getByRole('button', { name: 'FÜZE FIRLAT' });
  await expect(missile).toBeEnabled();
  await missile.click();
  const fire = page.getByTestId('laser-weapon').getByRole('button', { name: 'LAZER ATEŞLE' });
  for (let shot = 0; shot < 4; shot++) {
    await expect(fire).toBeEnabled({ timeout: 3000 });
    const before = await page.evaluate(() => window.__ORBITAL__!.getState()!.combat.contacts[0].health);
    await fire.click();
    await page.waitForFunction(
      (health) => window.__ORBITAL__!.getState()!.combat.contacts[0].health < health,
      before,
    );
  }
  // Keep defensive and offensive controls active until the exchange resolves.
  // The separate loss journey deliberately omits this defensive play.
  for (let step = 0; step < 80; step++) {
    const status = await page.evaluate(() => {
      const state = window.__ORBITAL__!.getState()!;
      return {
        targetDestroyed: state.combat.contacts[0].destroyed,
        playerDestroyed: state.combat.playerDestroyed,
        incoming: state.combat.missiles.some(item => item.status === 'ACTIVE' && item.targetId === state.ship.id),
      };
    });
    if (status.targetDestroyed || status.playerDestroyed) break;
    const countermeasure = page.getByTestId('countermeasure').getByRole('button', { name: 'KARŞI TEDBİR' });
    if (status.incoming) await countermeasure.evaluate((button: HTMLButtonElement) => {
      if (!button.disabled) button.click();
    });
    await missile.evaluate((button: HTMLButtonElement) => {
      if (!button.disabled) button.click();
    });
    await fire.evaluate((button: HTMLButtonElement) => {
      if (!button.disabled) button.click();
    });
    await page.waitForTimeout(150);
  }
  expect(await page.evaluate(() => window.__ORBITAL__!.getState()!.combat.playerDestroyed)).toBe(false);
  expect(await page.evaluate(() => window.__ORBITAL__!.getState()!.combat.contacts[0].health)).toBe(0);
  expect(await page.evaluate(() => window.__ORBITAL__!.getState()!.combat.contacts[0].destroyed)).toBe(true);
  await expect.poll(() => page.evaluate(() =>
    window.__ORBITAL__!.getState()!.missions.find((item) => item.type === 'INTERCEPT')?.status,
  )).toBe('COMPLETED');
  // Destroying the bot does not erase missiles already in flight. Resolve the
  // exchange, then use the existing recovery path if both ships were lost.
  await expect.poll(() => page.evaluate(() => {
    const state = window.__ORBITAL__!.getState()!;
    return state.combat.missiles.filter(item => item.status === 'ACTIVE' && item.targetId === state.ship.id).length;
  }), { timeout: 10000 }).toBe(0);
  if (await page.evaluate(() => window.__ORBITAL__!.getState()!.combat.playerDestroyed)) {
    await page.getByTestId('claim-replacement').click();
    await expect(page.getByTestId('recovery-card')).toContainText('YEDEK ARAÇ TESLİM EDİLDİ');
  }
  await page.getByRole('button', { name: 'Savaş panelini kapat' }).click();
  await page.getByRole('button', { name: 'GÖREV KONTROLÜ' }).click();
  await expect(page.getByLabel('Görev kontrolü')).toContainText('GÖREV TAMAMLANDI');
  await expect(page.getByTestId('profile-credits')).toHaveText('3.750');
  await page.getByRole('button', { name: 'Görev panelini kapat' }).click();
  await page.keyboard.down('w');
  await expect.poll(() => page.evaluate(() => window.__ORBITAL__!.getState()!.controls.translation[2])).toBe(-1);
  await page.keyboard.up('w');
  expect(errors).toEqual([]);
});

test('fails an active intercept on player loss and recovers through insurance UI', async ({ page, request }) => {
  await reset(request, intercept);
  await page.goto('/?scene=intercept&backend=webgl2');
  await ready(page);
  await page.getByTestId('faction-vanguard').click();
  await page.getByLabel('Görev kontrolü').getByRole('button', { name: 'YENİLE' }).click();
  await page.getByTestId('mission-intercept').getByRole('button', { name: 'GÖREVİ KABUL ET' }).click();
  await page.getByTestId('identify-target').click();
  await page.getByRole('button', { name: 'Görev panelini kapat' }).click();
  await page.getByRole('button', { name: 'ATEŞ KONTROLÜ' }).click();
  await expect(page.getByTestId('module-engine')).not.toContainText('%100', { timeout: 6000 });
  await expect(page.getByTestId('recovery-card')).toContainText('GEMİ İMHA EDİLDİ', { timeout: 25000 });
  expect(await page.evaluate(() => window.__ORBITAL__!.getState()!.missions.find((m) => m.type === 'INTERCEPT')?.status)).toBe('FAILED');
  await page.getByTestId('claim-replacement').click();
  await expect(page.getByTestId('recovery-card')).toContainText('YEDEK ARAÇ TESLİM EDİLDİ');
  await page.getByTestId('return-hangar').click();
  await expect(page.getByLabel('Hangar ve servisler')).toBeVisible();
  await expect(page.getByTestId('hangar-credits')).toHaveText('1.900 kredi');
  expect(await page.evaluate(() => window.__ORBITAL__!.getState()!.combat.playerDestroyed)).toBe(false);
  expect(await page.evaluate(() => window.__ORBITAL__!.getState()!.ship.definitionId)).toBe('RAPTOR_COMBAT');
});
