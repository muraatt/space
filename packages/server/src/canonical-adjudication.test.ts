import { describe, expect, it } from 'vitest';
import { CONFIG, type MissionInstance, type ShipState } from '@orbital/shared';
import {
  generateManeuverPlan,
  length,
  propagateKepler,
  scale,
  sub,
} from '@orbital/simulation';
import type { IdentityRecord, IdentityRepository } from './identity/identity-repository';
import { generateBountyPool, generateMissionPool, MISSION_TARGETS } from './missions/generator';
import { SharedSandbox } from './shared-sandbox';
import { World } from './world';

function circularTarget(ship: ShipState, offsetM: number) {
  const radius = length(ship.position) + offsetM,
    position = scale(ship.position, radius / length(ship.position)),
    velocity = scale(ship.velocity, Math.sqrt(CONFIG.earthMu / radius) / length(ship.velocity));
  return { kind: 'NEAR_RENDEZVOUS_STATE' as const, state: { position, velocity } };
}

function executeWithoutHandoff(offsetM: number) {
  const world = new World();
  world.reset('orbit_day');
  const target = circularTarget(world.state.ship, offsetM),
    candidate = generateManeuverPlan(world.state.ship, target).candidates.find((item) => item.type === 'FAST');
  if (!candidate) throw new Error(`FAST candidate missing at ${offsetM} m`);
  const startedAtMs = 1_800_000_000_000,
    started = world.startManeuver(`can-008-${offsetM}`, candidate, startedAtMs);
  if (!started.ok) throw new Error(started.code);
  let nowMs = startedAtMs, ticks = 0;
  while (world.state.maneuver?.status !== 'COMPLETE' && ticks++ < 200_000) {
    if (world.state.maneuver?.status === 'COASTING')
      nowMs = world.state.maneuver.nextEventAtMs ?? nowMs;
    else nowMs += CONFIG.fixedDt * 1000;
    world.tick(ticks, nowMs);
  }
  expect(world.state.maneuver?.status).toBe('COMPLETE');
  const elapsedSeconds = (world.state.maneuver!.completedAtMs! - startedAtMs) / 1000,
    targetAtArrival = propagateKepler(target.state, elapsedSeconds);
  return {
    offsetM,
    plannerPositionErrorM: candidate.verification.positionErrorM,
    plannerVelocityErrorMps: candidate.verification.velocityErrorMps,
    actualPositionErrorM: length(sub(world.state.ship.position, targetAtArrival.position)),
    actualVelocityErrorMps: length(sub(world.state.ship.velocity, targetAtArrival.velocity)),
    elapsedSeconds,
  };
}

class MemoryIdentities implements IdentityRepository {
  private records: IdentityRecord[] = [];
  async register(username: string, credential: string) {
    const index = this.records.length, record: IdentityRecord = {
      playerId: `player-${index}`, username, normalizedUsername: username.toLowerCase(),
      credentialHash: credential, shipId: `ship-${index}`, spawnSlot: index,
    };
    this.records.push(record);
    return { record: structuredClone(record), credential };
  }
  async authenticate(credential: string) {
    return structuredClone(this.records.find((item) => item.credentialHash === credential));
  }
  async saveShip(playerId: string, ship: ShipState) {
    const record = this.records.find((item) => item.playerId === playerId);
    if (record) record.ship = structuredClone(ship);
  }
  async health() {}
}

function standardOffers(world: World) {
  return generateMissionPool(
    'AURORA',
    generateManeuverPlan(world.state.ship, MISSION_TARGETS.cargo),
    generateManeuverPlan(world.state.ship, MISSION_TARGETS.reconnaissance),
    (length(world.state.ship.position) - CONFIG.earthRadius) / 1000,
    world.state.ship.performance.cargoCapacityKg,
    generateManeuverPlan(world.state.ship, MISSION_TARGETS.interception),
  );
}

function bountyOffers(world: World) {
  const plans = new Map(world.state.combat.contacts.filter((item) => item.bountyClass).map((target) => [
    target.id,
    generateManeuverPlan(world.state.ship, {
      kind: 'NEAR_RENDEZVOUS_STATE',
      state: { position: target.position, velocity: target.velocity },
    }),
  ]));
  return generateBountyPool('AURORA', world.state.combat.contacts, plans);
}

function atMissionAltitude(world: World, mission: MissionInstance) {
  const radius = CONFIG.earthRadius + mission.destination.altitudeKm * 1000;
  world.state.ship.position = scale(world.state.ship.position, radius / length(world.state.ship.position));
}

function fixedOfferIsExhausted(type: 'CARGO' | 'RECONNAISSANCE' | 'INTERCEPT' | 'BOUNTY') {
  const world = new World();
  world.reset(type === 'BOUNTY' ? 'bounty_sandbox' : 'orbit_day');
  world.chooseFaction('AURORA');
  const mission = structuredClone(
    (type === 'BOUNTY' ? bountyOffers(world) : standardOffers(world)).find((item) => item.type === type)!,
  );
  expect(world.setMissionOffers([mission]).ok).toBe(true);
  expect(world.acceptMission(mission.id, 1_000).ok).toBe(true);
  world.tick(1, 1_017);
  expect(world.abandonMission(mission.id, 1_100).ok).toBe(true);
  const retry = structuredClone(mission);
  retry.status = 'AVAILABLE';
  retry.acceptedAtMs = undefined;
  retry.failedAtMs = undefined;
  expect(world.setMissionOffers([retry]).ok).toBe(true);
  return !world.state.missions.some((item) => item.templateId === mission.templateId && item.status === 'AVAILABLE');
}

describe('canonical adjudication evidence', () => {
  it('CAN-008 compares planner verification with independently executed finite burns', () => {
    const results = [20_000, 50_000, 90_000].map(executeWithoutHandoff);
    console.info('CAN-008', JSON.stringify(results));
    expect(results.every((result) => result.plannerPositionErrorM < 10_000)).toBe(true);
    expect(results.every((result) => result.plannerVelocityErrorMps < 5)).toBe(true);
    expect(results.every((result) => result.actualPositionErrorM < 10_000)).toBe(true);
    expect(results.every((result) => result.actualVelocityErrorMps <= 5)).toBe(true);
    expect(results.every((result) =>
      Math.abs(result.actualVelocityErrorMps - result.plannerVelocityErrorMps) < 0.001,
    )).toBe(true);
  });

  it('CAN-009 measures the delayed-join AEGIS epoch discrepancy', async () => {
    let atMs = CONFIG.epochMs;
    const sandbox = new SharedSandbox(new MemoryIdentities(), undefined, () => atMs),
      a = await sandbox.register('ALPHA_EPOCH', 'a'.repeat(43));
    sandbox.connect(a.runtime);
    for (let tick = 1; tick <= 1_800; tick++) { atMs += CONFIG.fixedDt * 1000; sandbox.tick(tick * CONFIG.fixedDt * 1000); }
    a.runtime.world.state.ship.position = [...a.runtime.world.state.station.position];
    a.runtime.world.state.ship.velocity = [...a.runtime.world.state.station.velocity];
    const b = await sandbox.register('BRAVO_EPOCH', 'b'.repeat(43));
    sandbox.connect(b.runtime); sandbox.prepareSnapshots();
    const remoteA = b.runtime.world.state.remotePlayers.find((item) => item.playerId === a.record.playerId)!;
    const result = {
      delaySeconds: 30,
      remoteAToALocalAegisM: length(sub(remoteA.ship.position, a.runtime.world.state.station.position)),
      remoteAToBLocalAegisM: length(sub(remoteA.ship.position, b.runtime.world.state.station.position)),
      aLocalToBLocalAegisM: length(sub(a.runtime.world.state.station.position, b.runtime.world.state.station.position)),
    };
    console.info('CAN-009', JSON.stringify(result));
    expect(result.remoteAToALocalAegisM).toBe(0);
    expect(result.remoteAToBLocalAegisM).toBeLessThan(0.001);
    expect(result.aLocalToBLocalAegisM).toBe(0);
    await sandbox.flush();
  });

  it('CAN-005/CAN-006 freezes the fatal-destruction mission matrix', () => {
    const results: Record<string, unknown> = {};

    for (const type of ['CARGO', 'RECONNAISSANCE', 'INTERCEPT'] as const) {
      const world = new World();
      world.reset('orbit_day'); world.chooseFaction('AURORA');
      const offers = standardOffers(world), mission = offers.find((item) => item.type === type)!;
      expect(world.setMissionOffers(offers).ok).toBe(true);
      expect(world.acceptMission(mission.id, 1_000).ok).toBe(true);
      world.tick(1, 1_017); atMissionAltitude(world, mission);
      const credits = world.state.profile.credits;
      world.receivePlayerDamage(`fatal-${type}`, 1_000, 1_100);
      const postDestructionState = mission.status;
      let objectiveCompleted = false;
      if (type === 'CARGO')
        objectiveCompleted = world.deliverCargo(mission.id, mission.cargo!.id, mission.destination.id, 1_200).ok;
      if (type === 'RECONNAISSANCE') {
        objectiveCompleted = world.startScan(mission.id, mission.destination.id).ok;
        for (let tick = 0; tick < 400 && mission.status === 'ACTIVE'; tick++) world.tick(tick, 1_200 + tick * 17);
        objectiveCompleted = objectiveCompleted && mission.status === 'COMPLETED';
      }
      if (type === 'INTERCEPT')
        objectiveCompleted = world.identifyTarget(mission.id, mission.destination.id, 1_200).ok;
      const finalState = mission.status,
        rewardObtained = world.state.profile.credits > credits,
        fresh = standardOffers(world);
      expect(world.setMissionOffers(fresh).ok).toBe(true);
      results[type.toLowerCase()] = {
        postDestructionState, finalState, objectiveCompleted, rewardObtained,
        sameBaseOfferReappears: world.state.missions.some((item) => item.templateId === mission.templateId && item.status === 'AVAILABLE'),
        fixedOfferCanBeExhausted: fixedOfferIsExhausted(type),
      };
    }

    const bountyWorld = new World();
    bountyWorld.reset('bounty_sandbox'); bountyWorld.chooseFaction('AURORA');
    const offers = bountyOffers(bountyWorld), mission = offers[0];
    expect(bountyWorld.setMissionOffers(offers).ok).toBe(true);
    expect(bountyWorld.acceptMission(mission.id, 1_000).ok).toBe(true);
    bountyWorld.tick(1, 1_017);
    const credits = bountyWorld.state.profile.credits;
    bountyWorld.receivePlayerDamage('fatal-bounty', 1_000, 1_100);
    const postDestructionState = mission.status,
      objectiveCompleted = bountyWorld.identifyTarget(mission.id, mission.destination.id, 1_200).ok,
      finalState = mission.status,
      rewardObtained = bountyWorld.state.profile.credits > credits,
      fresh = bountyOffers(bountyWorld);
    expect(bountyWorld.setMissionOffers(fresh).ok).toBe(true);
    results.bounty = {
      postDestructionState, finalState, objectiveCompleted, rewardObtained,
      sameBaseOfferReappears: bountyWorld.state.missions.some((item) => item.templateId === mission.templateId && item.status === 'AVAILABLE'),
      fixedOfferCanBeExhausted: fixedOfferIsExhausted('BOUNTY'),
    };
    console.info('CAN-005/CAN-006', JSON.stringify(results));
    expect(results).toEqual({
      cargo: { postDestructionState: 'FAILED', finalState: 'FAILED', objectiveCompleted: false, rewardObtained: false, sameBaseOfferReappears: true, fixedOfferCanBeExhausted: false },
      reconnaissance: { postDestructionState: 'FAILED', finalState: 'FAILED', objectiveCompleted: false, rewardObtained: false, sameBaseOfferReappears: true, fixedOfferCanBeExhausted: false },
      intercept: { postDestructionState: 'FAILED', finalState: 'FAILED', objectiveCompleted: false, rewardObtained: false, sameBaseOfferReappears: true, fixedOfferCanBeExhausted: false },
      bounty: { postDestructionState: 'FAILED', finalState: 'FAILED', objectiveCompleted: false, rewardObtained: false, sameBaseOfferReappears: true, fixedOfferCanBeExhausted: false },
    });
  }, 15_000);
});
