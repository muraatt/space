import { describe, expect, it } from 'vitest';
import { CONFIG } from '@orbital/shared';
import { generateManeuverPlan } from '@orbital/simulation';
import { generateMissionPool, MISSION_TARGETS } from './missions/generator';
import { World } from './world';

function combatWorld() {
  const world = new World();
  world.reset('orbit_night');
  expect(world.selectCombatTarget('relay-contact-r17', 'target-1', 1000).ok).toBe(true);
  return world;
}

function switchToRaptor(world: World, transactionId: string) {
  world.state.docking.phase = 'DOCKED';
  world.state.docking.selectedStationId = world.state.station.id;
  world.state.docking.portId = world.state.station.ports[0].id;
  expect(world.selectShip('raptor-01', transactionId).ok).toBe(true);
  world.state.docking.phase = 'NONE';
}

function armedIntercept() {
  const world = new World();
  world.reset('intercept');
  world.chooseFaction('AURORA');
  const plan = generateManeuverPlan(world.state.ship, MISSION_TARGETS.interception);
  world.setMissionOffers(
    generateMissionPool(
      'AURORA',
      generateManeuverPlan(world.state.ship, MISSION_TARGETS.cargo),
      generateManeuverPlan(world.state.ship, MISSION_TARGETS.reconnaissance),
      400,
      world.state.ship.performance.cargoCapacityKg,
      plan,
    ),
  );
  const mission = world.state.missions.find((item) => item.type === 'INTERCEPT')!;
  expect(world.acceptMission(mission.id, 1000).ok).toBe(true);
  world.tick(1, 1017);
  expect(world.identifyTarget(mission.id, mission.destination.id, 1100).ok).toBe(true);
  return { world, mission };
}

describe('authoritative combat foundation', () => {
  it('rejects SAFE fire and preserves an existing combat tag across the boundary', () => {
    const world = combatWorld();
    world.state.combat.combatTagUntilMs = 999_999;
    world.setCombatRegion('SAFE');
    expect(world.fireLaser('laser-safe', 2000)).toMatchObject({ ok: false, code: 'COMBAT_FORBIDDEN_SAFE' });
    expect(world.state.combat.combatTagUntilMs).toBe(999_999);
  });

  it('requires NORMAL permission and accepts mission-authorized engagement', () => {
    const denied = new World();
    denied.reset('intercept');
    denied.state.combat.contacts[0].eligible = true;
    expect(denied.selectCombatTarget('relay-contact-r17', 'normal-denied', 1000)).toMatchObject({
      ok: false,
      code: 'COMBAT_PERMISSION_REQUIRED',
    });
    const { world } = armedIntercept();
    expect(world.selectCombatTarget('relay-contact-r17', 'normal-allowed', 1200).ok).toBe(true);
  });

  it('allows CONTESTED targeting and rejects invalid, self and stale targets', () => {
    const world = new World();
    world.reset('orbit_night');
    expect(world.selectCombatTarget(world.state.ship.id, 'self', 1000)).toMatchObject({
      ok: false,
      code: 'SELF_TARGET',
    });
    expect(world.selectCombatTarget('missing', 'missing', 1000)).toMatchObject({
      ok: false,
      code: 'UNKNOWN_TARGET',
    });
    expect(world.selectCombatTarget('relay-contact-r17', 'valid', 1000).ok).toBe(true);
    world.state.combat.contacts[0].destroyed = true;
    expect(world.selectCombatTarget('relay-contact-r17', 'destroyed', 1000)).toMatchObject({
      ok: false,
      code: 'TARGET_INELIGIBLE',
    });
  });

  it('validates laser range, LOS, energy, heat and cooldown', () => {
    const range = combatWorld();
    range.state.combat.contacts[0].position = [
      range.state.ship.position[0],
      range.state.ship.position[1],
      range.state.ship.position[2] - CONFIG.laserRangeM - 10,
    ];
    expect(range.fireLaser('range', 2000)).toMatchObject({ ok: false, code: 'TARGET_OUT_OF_RANGE' });

    const los = combatWorld();
    los.state.combat.contacts[0].occluded = true;
    expect(los.fireLaser('los', 2000)).toMatchObject({ ok: false, code: 'NO_LINE_OF_SIGHT' });

    const resources = combatWorld();
    expect(resources.fireLaser('first', 2000).ok).toBe(true);
    expect(resources.fireLaser('cooldown', 2001)).toMatchObject({ ok: false, code: 'LASER_COOLDOWN' });
    resources.state.combat.laserCooldownUntilMs = 0;
    resources.state.combat.laserEnergy = CONFIG.laserEnergyCost - 1;
    expect(resources.fireLaser('energy', 3000)).toMatchObject({ ok: false, code: 'LASER_ENERGY_LOW' });
    resources.state.combat.laserEnergy = 100;
    resources.state.combat.laserHeat = 100;
    expect(resources.fireLaser('heat', 3000)).toMatchObject({ ok: false, code: 'LASER_OVERHEAT' });
  });

  it('consumes missile ammunition and rejects duplicate launch commands', () => {
    const world = combatWorld();
    switchToRaptor(world, 'switch-combat');
    world.setCombatRegion('CONTESTED');
    expect(world.selectCombatTarget('relay-contact-r17', 'retarget', 2000).ok).toBe(true);
    const before = world.state.ship.mass.ammunitionKg;
    expect(world.fireMissile('launch-1', 2100).ok).toBe(true);
    expect(world.state.ship.mass.ammunitionKg).toBe(before - CONFIG.missileMassKg);
    expect(world.fireMissile('launch-1', 4000)).toMatchObject({
      ok: false,
      code: 'DUPLICATE_COMBAT_COMMAND',
    });
    for (let tick = 0; tick < 600 && world.state.combat.missiles[0].status === 'ACTIVE'; tick++)
      world.tick(tick + 1, 2200 + tick * CONFIG.fixedDt * 1000);
    expect(world.state.combat.missiles[0].status).toBe('HIT');
    expect(world.state.combat.contacts[0].health).toBe(100 - CONFIG.missileDamage);
  });

  it('expires a missile and applies a swept hit only once', () => {
    const world = combatWorld();
    switchToRaptor(world, 'switch-missile');
    world.setCombatRegion('CONTESTED');
    world.selectCombatTarget('relay-contact-r17', 'target-missile', 2000);
    expect(world.fireMissile('expire-launch', 2100).ok).toBe(true);
    world.state.combat.contacts[0].position = [world.state.ship.position[0], 0, -200_000];
    for (let i = 0; i < Math.ceil(CONFIG.missileLifetimeSeconds / CONFIG.fixedDt) + 2; i++)
      world.tick(i + 2, 2200 + i * CONFIG.fixedDt * 1000);
    expect(world.state.combat.missiles[0].status).toBe('EXPIRED');

    const hit = combatWorld();
    hit.state.combat.missiles.push({
      id: 'swept',
      sourceId: hit.state.ship.id,
      targetId: hit.state.combat.contacts[0].id,
      position: [hit.state.ship.position[0], 0, -1310],
      previousPosition: [hit.state.ship.position[0], 0, -1310],
      velocity: [0, 0, -900],
      remainingPropulsionSeconds: 0,
      remainingLifetimeSeconds: 2,
      damage: 10,
      status: 'ACTIVE',
    });
    const before = hit.state.combat.contacts[0].health;
    hit.tick(2, 2200);
    hit.tick(3, 2217);
    expect(hit.state.combat.contacts[0].health).toBe(before - 10);
  });

  it('uses a finite deterministic countermeasure and rejects replay', () => {
    const { world } = armedIntercept();
    expect(world.state.combat.missiles.some((item) => item.targetId === world.state.ship.id)).toBe(true);
    const charges = world.state.combat.countermeasureCharges;
    expect(world.activateCountermeasure('cm-1', 1200)).toEqual({ ok: true, success: true });
    expect(world.state.combat.countermeasureCharges).toBe(charges - 1);
    expect(world.state.combat.missiles.some((item) => item.status === 'DECOYED')).toBe(true);
    expect(world.activateCountermeasure('cm-1', 7000)).toMatchObject({
      ok: false,
      code: 'DUPLICATE_COMBAT_COMMAND',
    });
  });

  it('completes combat INTERCEPT exactly once from authoritative damage', () => {
    const { world, mission } = armedIntercept();
    const initialCredits = world.state.profile.credits;
    world.state.combat.contacts[0].health = 48;
    world.selectCombatTarget('relay-contact-r17', 'mission-target', 1200);
    for (let index = 0; index < 4; index++)
      expect(world.fireLaser(`mission-laser-${index}`, 2000 + index * 500).ok).toBe(true);
    expect(mission.intercept?.neutralized).toBe(true);
    expect(world.state.combat.contacts[0].destroyed).toBe(true);
    expect(world.state.combat.bot.mode).toBe('DESTROYED');
    expect(mission.status).toBe('COMPLETED');
    expect(world.state.profile.credits).toBe(initialCredits + mission.reward.credits);
    expect(world.fireLaser('post-complete', 5000)).toMatchObject({
      ok: false,
      code: 'NO_TARGET',
    });
    expect(world.state.profile.credits).toBe(initialCredits + mission.reward.credits);
  });
});
