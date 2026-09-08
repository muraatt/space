import { describe, expect, it } from 'vitest';
import { CONFIG, clientMessageSchema, neutralControls } from '@orbital/shared';
import { World } from './world';
import { dispatch } from './commands/dispatch';
import { generateManeuverPlan } from '@orbital/simulation';
import { generateMissionPool, MISSION_TARGETS } from './missions/generator';

describe('authoritative damage, loss and recovery', () => {
  it('applies deterministic module consequences and rejects duplicate damage', () => {
    const world = new World();
    world.reset('orbit_day');
    const thrust = world.state.ship.performance.mainThrustN;
    expect(world.receivePlayerDamage('engine-hit', 10, 1000).ok).toBe(true);
    expect(world.state.combat.modules.ENGINE.condition).toBe(84);
    expect(world.state.ship.performance.mainThrustN).toBeLessThan(thrust);

    const fuel = world.state.ship.mass.propellantKg;
    world.receivePlayerDamage('fuel-hit', 10, 1100);
    expect(world.state.combat.modules.FUEL.condition).toBe(84);
    expect(world.state.ship.mass.propellantKg).toBe(fuel - 20);
    expect(world.state.ship.mass.propellantKg).toBeGreaterThanOrEqual(0);

    world.state.combat.laserEnergy = 0;
    world.receivePlayerDamage('power-hit', 10, 1200);
    world.tick(1, 1217);
    expect(world.state.combat.laserEnergy).toBeLessThan(CONFIG.laserEnergyRechargePerSecond * CONFIG.fixedDt);

    world.receivePlayerDamage('weapon-hit', 35, 1300);
    expect(world.state.combat.modules.WEAPON.condition).toBe(44);
    expect(world.receivePlayerDamage('weapon-hit', 1, 1400)).toMatchObject({
      ok: false,
      code: 'DUPLICATE_DAMAGE',
    });
    expect(world.receivePlayerDamage('invalid', Number.NaN, 1500)).toMatchObject({
      ok: false,
      code: 'INVALID_DAMAGE',
    });
    for (const module of Object.values(world.state.combat.modules)) {
      expect(Number.isFinite(module.condition)).toBe(true);
      expect(module.condition).toBeGreaterThanOrEqual(0);
      expect(module.condition).toBeLessThanOrEqual(100);
    }
  });

  it('disables weapons when the weapon module fails', () => {
    const world = new World();
    world.reset('orbit_night');
    world.selectCombatTarget('relay-contact-r17', 'target', 1000);
    world.receivePlayerDamage('engine', 1, 1000);
    world.receivePlayerDamage('fuel', 1, 1001);
    world.receivePlayerDamage('power', 1, 1002);
    world.receivePlayerDamage('weapon', 50, 1003);
    expect(world.state.combat.modules.WEAPON.condition).toBe(20);
    expect(world.fireLaser('offline-laser', 2000)).toMatchObject({ ok: false, code: 'WEAPON_OFFLINE' });
    expect(world.fireMissile('offline-missile', 2000)).toMatchObject({ ok: false, code: 'WEAPON_OFFLINE' });
  });

  it('creates one wreck, resolves cargo/modules and blocks a destroyed ship', () => {
    const world = new World();
    world.reset('orbit_day');
    world.state.ship.mass.cargoKg = 90;
    world.state.ship.mass.ammunitionKg = 8;
    world.state.ship.installedUpgradeIds = ['survey-sensor-array'];
    expect(world.receivePlayerDamage('fatal', 100, 1000).ok).toBe(true);
    expect(world.state.combat.playerDestroyed).toBe(true);
    expect(world.state.combat.wrecks).toHaveLength(1);
    expect(world.state.combat.wrecks[0]).toMatchObject({
      cargoLostKg: 90,
      ammunitionLostKg: 8,
      upgradeIdsLost: ['survey-sensor-array'],
    });
    expect(world.receivePlayerDamage('fatal-again', 1, 1001)).toMatchObject({
      ok: false,
      code: 'SHIP_DESTROYED',
    });
    expect(world.fireLaser('after-loss', 1002)).toMatchObject({ ok: false, code: 'SHIP_DESTROYED' });
    const before = structuredClone(world.state.ship.position);
    world.state.controls = { translation: [0, 0, -1], rotation: [1, 0, 0] };
    world.tick(2, 1017);
    expect(world.state.controls).toEqual(neutralControls());
    expect(world.state.ship.position).toEqual(before);
    expect(world.state.combat.events.filter((event) => event.type === 'SHIP_DESTROYED')).toHaveLength(1);
  });

  it('claims replacement atomically and guarantees a free Kestrel when funds are insufficient', () => {
    const world = new World();
    world.reset('intercept');
    world.state.profile.credits = 0;
    world.receivePlayerDamage('fatal', 100, 1000);
    expect(world.claimReplacement('claim-1', 2000)).toMatchObject({ ok: true, cost: 0 });
    expect(world.state.ship.definitionId).toBe('KESTREL_LOGISTICS');
    expect(world.state.combat.playerDestroyed).toBe(false);
    expect(world.state.ship.mass.cargoKg).toBe(0);
    expect(world.state.ship.installedUpgradeIds).toEqual([]);
    expect(world.state.profile.ownedShipIds).toContain(world.state.ship.id);
    expect(world.claimReplacement('claim-1', 2001)).toMatchObject({
      ok: false,
      code: 'DUPLICATE_TRANSACTION',
    });
    expect(world.state.profile.credits).toBe(0);
  });

  it('charges the server deductible once for a covered Raptor replacement', () => {
    const world = new World();
    world.reset('intercept');
    const credits = world.state.profile.credits;
    world.receivePlayerDamage('fatal', 100, 1000);
    const claimed = world.claimReplacement('raptor-claim', 2000);
    expect(claimed).toMatchObject({ ok: true, cost: CONFIG.raptorInsuranceDeductibleCredits });
    expect(world.state.ship.definitionId).toBe('RAPTOR_COMBAT');
    expect(world.state.profile.credits).toBe(credits - CONFIG.raptorInsuranceDeductibleCredits);
  });

  it('runs a deterministic bot attack and missile-hit loss path', () => {
    const world = new World();
    world.reset('missile_hit');
    for (let tick = 0; tick < 1200 && !world.state.combat.playerDestroyed; tick++)
      world.tick(tick, CONFIG.epochMs + tick * CONFIG.fixedDt * 1000);
    expect(world.state.combat.bot.mode).not.toBe('PATROL');
    expect(world.state.combat.events.some((event) => event.type === 'MISSILE_HIT')).toBe(true);
    expect(world.state.combat.events.some((event) => event.type === 'MODULE_DAMAGED')).toBe(true);
    expect(world.state.combat.playerDestroyed).toBe(true);
    expect(world.state.combat.recovery?.status).toBe('PENDING');
  });

  it('fails an active intercept without granting a destruction reward', () => {
    const world = new World();
    world.reset('intercept');
    world.chooseFaction('AURORA');
    world.setMissionOffers(
      generateMissionPool(
        'AURORA',
        generateManeuverPlan(world.state.ship, MISSION_TARGETS.cargo),
        generateManeuverPlan(world.state.ship, MISSION_TARGETS.reconnaissance),
        400,
        world.state.ship.performance.cargoCapacityKg,
        generateManeuverPlan(world.state.ship, MISSION_TARGETS.interception),
      ),
    );
    const mission = world.state.missions.find((item) => item.type === 'INTERCEPT')!;
    world.acceptMission(mission.id, 1000);
    world.tick(1, 1017);
    world.identifyTarget(mission.id, mission.destination.id, 1100);
    const credits = world.state.profile.credits;
    world.receivePlayerDamage('fatal-mission-hit', 100, 1200);
    expect(mission.status).toBe('FAILED');
    expect(world.state.profile.credits).toBe(credits);
    expect(world.state.profile.activeMissionId).toBeUndefined();
  });

  it('rejects forged damage/replacement content and movement after destruction at protocol boundary', () => {
    const forged = {
      type: 'claim_replacement',
      version: 1,
      shipId: 'raptor-01',
      transactionId: 'claim',
      price: 0,
      replacement: { definitionId: 'RAPTOR_COMBAT', ammunitionKg: 999 },
      damage: 999,
    };
    expect(clientMessageSchema.safeParse(forged).success).toBe(false);
    const world = new World();
    world.reset('intercept');
    world.receivePlayerDamage('fatal', 100, 1000);
    expect(
      dispatch(
        world.state,
        {
          type: 'input',
          version: 1,
          shipId: world.state.ship.id,
          seq: 1,
          translation: [0, 0, -1],
          rotation: [0, 0, 0],
        },
        world.state.ship.id,
      ),
    ).toMatchObject({ ok: false, code: 'SHIP_DESTROYED' });
  });
});
