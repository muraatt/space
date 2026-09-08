import { describe, expect, it } from 'vitest';
import { CONFIG, STATION_ID, STATION_PORT_ID, type MissionInstance } from '@orbital/shared';
import { generateManeuverPlan, orientationForBodyMinusZ, sub } from '@orbital/simulation';
import { generateBountyPool } from './missions/generator';
import { World } from './world';

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

function accept(world: World, targetClass: 'SCOUT' | 'FIGHTER' | 'HEAVY', now = CONFIG.epochMs) {
  const offers = bountyOffers(world);
  expect(world.setMissionOffers(offers).ok).toBe(true);
  const mission = world.state.missions.find((item) => item.bounty?.targetClass === targetClass)!;
  expect(world.acceptMission(mission.id, now).ok).toBe(true);
  world.tick(0, now + 17);
  return mission;
}

function placeAtTarget(world: World, mission: MissionInstance) {
  const target = world.state.combat.contacts.find((item) => item.id === mission.bounty!.targetId)!;
  world.state.ship.position = [target.position[0], target.position[1], target.position[2] + 1_200];
  world.state.ship.velocity = [...target.velocity];
  world.state.ship.orientation = orientationForBodyMinusZ(sub(target.position, world.state.ship.position));
  world.setCombatRegion('NORMAL');
  return target;
}

describe('authoritative repeatable bounty loop', () => {
  it('generates three stable reachable archetypes with ordered rewards and real target state', () => {
    const world = new World();
    world.reset('bounty_sandbox');
    const before = world.state.combat.contacts.filter((item) => item.bountyClass).map((item) => [...item.position]);
    const offers = bountyOffers(world);
    expect(offers.map((item) => item.bounty?.targetClass)).toEqual(['SCOUT', 'FIGHTER', 'HEAVY']);
    expect(offers.map((item) => item.reward.credits)).toEqual([1800, 3200, 4800]);
    expect(new Set(offers.map((item) => item.id)).size).toBe(3);
    expect(offers.every((item) => item.reachable && item.bounty!.estimatedDeltaVMps > 0)).toBe(true);
    for (let i = 0; i < 60; i++) world.tick(i * 17, CONFIG.epochMs + i * 17);
    const after = world.state.combat.contacts.filter((item) => item.bountyClass).map((item) => item.position);
    expect(after.every((position, index) => position.some((value, axis) => value !== before[index][axis]))).toBe(true);
  });

  it('requires AEGIS docking and binds acceptance, acquisition, kill and reward to one target', () => {
    const world = new World();
    world.reset('bounty_sandbox');
    const offers = bountyOffers(world);
    expect(world.setMissionOffers(offers).ok).toBe(true);
    const scout = world.state.missions.find((item) => item.bounty?.targetClass === 'SCOUT')!;
    world.state.docking.phase = 'FINAL_APPROACH';
    expect(world.acceptMission(scout.id, CONFIG.epochMs)).toEqual({ ok: false, code: 'BOUNTY_REQUIRES_DOCKING' });
    world.state.docking.phase = 'DOCKED';
    expect(world.acceptMission(scout.id, CONFIG.epochMs).ok).toBe(true);
    expect(world.acceptMission(scout.id, CONFIG.epochMs + 1)).toEqual({ ok: false, code: 'MISSION_ACTIVE' });
    expect(world.undock(STATION_ID, 'bounty-undock').ok).toBe(true);
    world.tick(0, CONFIG.epochMs + 17);
    const target = placeAtTarget(world, scout),
      wrong = world.state.combat.contacts.find((item) => item.bountyClass === 'FIGHTER')!;
    wrong.eligible = true;
    expect(world.selectCombatTarget(wrong.id, 'wrong-target', CONFIG.epochMs + 20)).toEqual({
      ok: false,
      code: 'COMBAT_PERMISSION_REQUIRED',
    });
    expect(world.identifyTarget(scout.id, scout.destination.id, CONFIG.epochMs + 30).ok).toBe(true);
    expect(world.selectCombatTarget(target.id, 'right-target', CONFIG.epochMs + 40).ok).toBe(true);
    const credits = world.state.profile.credits;
    for (let shot = 0; shot < 6 && !target.destroyed; shot++) {
      world.state.combat.laserEnergy = 100;
      world.state.combat.laserHeat = 0;
      expect(world.fireLaser(`bounty-shot-${shot}`, CONFIG.epochMs + 1000 + shot * 500).ok).toBe(true);
    }
    expect(target.destroyed).toBe(true);
    expect(scout.status).toBe('COMPLETED');
    expect(scout.bounty?.rewardIssued).toBe(true);
    expect(world.state.profile.credits).toBe(credits + scout.reward.credits);
    expect(world.fireLaser('post-kill', CONFIG.epochMs + 5000).ok).toBe(false);
    expect(world.state.profile.credits).toBe(credits + scout.reward.credits);
    expect(bountyOffers(world).some((item) => item.bounty?.targetId === target.id)).toBe(false);
  });

  it('runs deterministic archetype behavior, fails on player loss and accepts a second bounty', () => {
    const scoutWorld = new World();
    scoutWorld.reset('bounty_sandbox');
    const scout = accept(scoutWorld, 'SCOUT');
    const scoutTarget = placeAtTarget(scoutWorld, scout), beforeVelocity = [...scoutTarget.velocity];
    expect(scoutWorld.identifyTarget(scout.id, scout.destination.id, CONFIG.epochMs + 30).ok).toBe(true);
    scoutWorld.tick(20, CONFIG.epochMs + 50);
    expect(scoutWorld.state.combat.bot.mode).toBe('REPOSITION');
    expect(scoutTarget.velocity).not.toEqual(beforeVelocity);

    const fighterWorld = new World();
    fighterWorld.reset('bounty_sandbox');
    const fighter = accept(fighterWorld, 'FIGHTER');
    placeAtTarget(fighterWorld, fighter);
    expect(fighterWorld.identifyTarget(fighter.id, fighter.destination.id, CONFIG.epochMs + 30).ok).toBe(true);
    fighterWorld.tick(20, CONFIG.epochMs + 50);
    expect(fighterWorld.state.combat.bot.mode).toBe('ATTACK');

    const heavyWorld = new World();
    heavyWorld.reset('bounty_sandbox');
    const heavy = accept(heavyWorld, 'HEAVY');
    placeAtTarget(heavyWorld, heavy);
    expect(heavyWorld.identifyTarget(heavy.id, heavy.destination.id, CONFIG.epochMs + 30).ok).toBe(true);
    heavyWorld.tick(20, CONFIG.epochMs + 50);
    expect(heavyWorld.state.combat.bot.mode).toBe('ATTACK');
    const credits = heavyWorld.state.profile.credits;
    heavyWorld.receivePlayerDamage('loss', 1000, CONFIG.epochMs + 60);
    expect(heavy.status).toBe('FAILED');
    expect(heavyWorld.state.profile.credits).toBe(credits);

    const repeatWorld = new World();
    repeatWorld.reset('bounty_sandbox');
    const first = accept(repeatWorld, 'SCOUT');
    repeatWorld.abandonMission(first.id, CONFIG.epochMs + 100);
    repeatWorld.state.docking.phase = 'DOCKED';
    repeatWorld.state.docking.selectedStationId = STATION_ID;
    repeatWorld.state.docking.portId = STATION_PORT_ID;
    const second = repeatWorld.state.missions.find((item) => item.bounty?.targetClass === 'FIGHTER')!;
    expect(repeatWorld.acceptMission(second.id, CONFIG.epochMs + 200).ok).toBe(true);
  });
});
