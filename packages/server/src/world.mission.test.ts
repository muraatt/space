import { describe, expect, it } from 'vitest';
import { CONFIG } from '@orbital/shared';
import { generateManeuverPlan, totalMassKg } from '@orbital/simulation';
import { generateMissionPool, MISSION_TARGETS } from './missions/generator';
import { World } from './world';

function offers(world: World) {
  return generateMissionPool(
    'AURORA',
    generateManeuverPlan(world.state.ship, MISSION_TARGETS.cargo),
    generateManeuverPlan(world.state.ship, MISSION_TARGETS.reconnaissance),
    (Math.hypot(...world.state.ship.position) - CONFIG.earthRadius) / 1000,
    world.state.ship.performance.cargoCapacityKg,
    generateManeuverPlan(world.state.ship, MISSION_TARGETS.interception),
  );
}

function placeAt(world: World, altitudeKm: number) {
  const radius = CONFIG.earthRadius + altitudeKm * 1000;
  world.state.ship.position = [radius, 0, 0];
  world.state.ship.velocity = [0, 0, -Math.sqrt(CONFIG.earthMu / radius)];
}

describe('authoritative mission loop', () => {
  it('accepts identified cargo, applies mass, rejects wrong delivery and rewards once', () => {
    const world = new World(),
      initialCredits = world.state.profile.credits;
    expect(world.chooseFaction('AURORA').ok).toBe(true);
    expect(world.setMissionOffers(offers(world)).ok).toBe(true);
    const mission = world.state.missions.find((item) => item.type === 'CARGO')!;
    const dryCargo = world.state.ship.mass.cargoKg;
    expect(world.acceptMission(mission.id, 1000).ok).toBe(true);
    expect(mission.status).toBe('ACCEPTED');
    expect(world.state.ship.mass.cargoKg).toBe(dryCargo + mission.cargo!.massKg);
    expect(world.state.ship.massKg).toBe(totalMassKg(world.state.ship.mass));
    world.tick(1, 1017);
    expect(mission.status).toBe('ACTIVE');
    expect(world.deliverCargo(mission.id, 'forged-cargo', mission.destination.id, 2000)).toMatchObject({
      ok: false,
      code: 'INVALID_CARGO',
    });
    expect(world.deliverCargo(mission.id, mission.cargo!.id, 'wrong-port', 2000)).toMatchObject({
      ok: false,
      code: 'WRONG_DESTINATION',
    });
    expect(world.deliverCargo(mission.id, mission.cargo!.id, mission.destination.id, 2000)).toMatchObject({
      ok: false,
      code: 'NOT_AT_DESTINATION',
    });
    placeAt(world, mission.destination.altitudeKm);
    expect(world.deliverCargo(mission.id, mission.cargo!.id, mission.destination.id, 3000).ok).toBe(true);
    expect(mission.status).toBe('COMPLETED');
    expect(world.state.profile.credits).toBe(initialCredits + mission.reward.credits);
    expect(world.state.profile.reputation).toBe(mission.reward.reputation);
    expect(world.state.ship.mass.cargoKg).toBe(dryCargo);
    expect(world.deliverCargo(mission.id, mission.cargo!.id, mission.destination.id, 3001)).toMatchObject({
      ok: false,
      code: 'INVALID_MISSION_STATE',
    });
    expect(world.state.profile.credits).toBe(initialCredits + mission.reward.credits);
  });

  it('progresses reconnaissance only at its destination and rewards atomically', () => {
    const world = new World(),
      initialCredits = world.state.profile.credits;
    world.chooseFaction('AURORA');
    world.setMissionOffers(offers(world));
    const mission = world.state.missions.find((item) => item.type === 'RECONNAISSANCE')!;
    world.acceptMission(mission.id, 1000);
    world.tick(1, 1017);
    expect(world.startScan(mission.id, mission.destination.id)).toMatchObject({
      ok: false,
      code: 'SCAN_UNAVAILABLE',
    });
    placeAt(world, mission.destination.altitudeKm);
    expect(world.startScan(mission.id, 'wrong-target')).toMatchObject({
      ok: false,
      code: 'WRONG_DESTINATION',
    });
    expect(world.startScan(mission.id, mission.destination.id).ok).toBe(true);
    for (let tick = 0; tick < Math.ceil(CONFIG.reconScanSeconds / CONFIG.fixedDt) + 1; tick++)
      world.tick(tick + 2, 2000 + tick * CONFIG.fixedDt * 1000);
    expect(mission.status).toBe('COMPLETED');
    expect(mission.recon?.progressSeconds).toBe(CONFIG.reconScanSeconds);
    expect(world.state.profile.credits).toBe(initialCredits + mission.reward.credits);
    expect(world.state.profile.reputation).toBe(mission.reward.reputation);
  });

  it('fails an active mission without a reward and removes its cargo', () => {
    const world = new World(),
      initialCredits = world.state.profile.credits;
    world.chooseFaction('VANGUARD');
    world.setMissionOffers(
      generateMissionPool(
        'VANGUARD',
        generateManeuverPlan(world.state.ship, MISSION_TARGETS.cargo),
        generateManeuverPlan(world.state.ship, MISSION_TARGETS.reconnaissance),
      ),
    );
    const mission = world.state.missions.find((item) => item.type === 'CARGO')!;
    world.acceptMission(mission.id, 1000);
    expect(world.abandonMission(mission.id, 1001).ok).toBe(true);
    expect(mission.status).toBe('FAILED');
    expect(world.state.profile.credits).toBe(initialCredits);
    expect(world.state.ship.mass.cargoKg).toBe(0);
    expect(world.acceptMission(mission.id, 1002)).toMatchObject({ ok: false, code: 'INVALID_MISSION_STATE' });
  });

  it('completes non-combat interception once after authoritative identification', () => {
    const world = new World(),
      initialCredits = world.state.profile.credits;
    world.chooseFaction('AURORA');
    world.setMissionOffers(offers(world));
    const mission = world.state.missions.find((item) => item.type === 'INTERCEPT')!;
    world.acceptMission(mission.id, 1000);
    world.tick(1, 1017);
    placeAt(world, 450);
    expect(world.identifyTarget(mission.id, mission.destination.id, 2000)).toMatchObject({
      ok: false,
      code: 'IDENTIFY_UNAVAILABLE',
    });
    placeAt(world, mission.destination.altitudeKm);
    expect(world.identifyTarget(mission.id, 'wrong-target', 2001)).toMatchObject({
      ok: false,
      code: 'WRONG_DESTINATION',
    });
    expect(world.identifyTarget(mission.id, mission.destination.id, 2002).ok).toBe(true);
    expect(mission.intercept?.identified).toBe(true);
    expect(world.state.profile.credits).toBe(initialCredits + mission.reward.credits);
    expect(world.identifyTarget(mission.id, mission.destination.id, 2003)).toMatchObject({
      ok: false,
      code: 'INVALID_MISSION_STATE',
    });
    expect(world.state.profile.credits).toBe(initialCredits + mission.reward.credits);
  });
});
