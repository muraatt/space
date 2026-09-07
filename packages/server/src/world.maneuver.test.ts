import { describe, expect, it } from 'vitest';
import { CONFIG } from '@orbital/shared';
import { generateManeuverPlan } from '@orbital/simulation';
import { World } from './world';

const target = {
  kind: 'CIRCULAR_ORBIT' as const,
  radiusM: CONFIG.earthRadius + 800_000,
  phaseAheadRad: 0.13179322079005384,
};

describe('authoritative maneuver execution', () => {
  it('executes finite burns around a timestamped coast and consumes fuel once', () => {
    const world = new World(),
      candidate = generateManeuverPlan(world.state.ship, target).candidates[0],
      startedAt = 1_800_000_000_000,
      initialPropellant = world.state.ship.mass.propellantKg,
      started = world.startManeuver('execution-plan', candidate, startedAt);
    expect(started.ok).toBe(true);
    expect(world.state.maneuver?.status).toBe('EXECUTING_BURN');
    expect(world.startManeuver('duplicate', candidate, startedAt)).toMatchObject({
      ok: false,
      code: 'MANEUVER_ACTIVE',
    });

    let ticks = 0;
    while (world.state.maneuver?.status === 'EXECUTING_BURN' && ticks++ < 10_000)
      world.tick(ticks, startedAt + ticks * CONFIG.fixedDt * 1000);
    expect(world.state.maneuver?.status).toBe('COASTING');
    const coastPosition = [...world.state.ship.position],
      nextEvent = world.state.maneuver!.nextEventAtMs!;
    world.tick(ticks + 1, nextEvent - 120_000);
    expect(world.state.maneuver?.status).toBe('COASTING');
    expect(world.state.ship.position).not.toEqual(coastPosition);
    expect(world.state.maneuver?.coastAnchor?.atMs).toBeGreaterThan(startedAt);

    world.tick(ticks + 2, nextEvent + 1);
    expect(world.state.maneuver?.status).toBe('ARRIVAL_BURN');
    while (world.state.maneuver?.status === 'ARRIVAL_BURN' && ticks++ < 20_000)
      world.tick(ticks, nextEvent + 1 + ticks * CONFIG.fixedDt * 1000);
    expect(world.state.maneuver?.status).toBe('COMPLETE');
    expect(world.state.ship.mass.propellantKg).toBeLessThan(initialPropellant);
    expect(world.state.ship.mass.propellantKg).toBeGreaterThanOrEqual(0);
    expect(
      Math.hypot(
        ...world.state.ship.position.map(
          (value, index) => value - candidate.expectedFinalState.position[index],
        ),
      ),
    ).toBeLessThan(10_000);
    expect(
      Math.hypot(
        ...world.state.ship.velocity.map(
          (value, index) => value - candidate.expectedFinalState.velocity[index],
        ),
      ),
    ).toBeLessThan(5);
    expect(world.state.maneuver?.completedAtMs).toBeGreaterThan(nextEvent);
  });

  it('cancels a coast at its authoritative timestamp without consuming a second burn', () => {
    const world = new World(),
      candidate = generateManeuverPlan(world.state.ship, { ...target, phaseAheadRad: 0.5 }).candidates[0],
      startedAt = 1_800_000_000_000,
      initialPropellant = world.state.ship.mass.propellantKg,
      started = world.startManeuver('cancel-plan', candidate, startedAt);
    if (!started.ok) throw new Error(started.code);
    const before = [...world.state.ship.position],
      cancelled = world.cancelManeuver(started.executionId, startedAt + 1_000_000);
    expect(cancelled.ok).toBe(true);
    expect(world.state.maneuver?.status).toBe('CANCELLED');
    expect(world.state.ship.position).not.toEqual(before);
    expect(world.state.ship.mass.propellantKg).toBe(initialPropellant);
    expect(world.cancelManeuver(started.executionId, startedAt + 1_000_001)).toMatchObject({
      ok: false,
      code: 'MANEUVER_NOT_ACTIVE',
    });
  });

  it('provides the low_fuel scenario without negative mass', () => {
    const world = new World();
    world.reset('low_fuel');
    expect(world.state.ship.mass.propellantKg).toBe(CONFIG.lowFuelPropellantKg);
    expect(generateManeuverPlan(world.state.ship, target).candidates).toEqual([]);
    expect(world.state.ship.mass.propellantKg).toBeGreaterThanOrEqual(0);
  });
});
