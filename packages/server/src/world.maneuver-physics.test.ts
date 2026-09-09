import { describe, expect, it } from 'vitest';
import { CONFIG, type ManeuverCandidate } from '@orbital/shared';
import { availableDeltaV, propulsionStep } from '@orbital/simulation';
import { World } from './world';

function singleBurnCandidate(world: World, durationSeconds: number): ManeuverCandidate {
  const controls = { translation: [0, 0, -1] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] },
    expected = durationSeconds > 0
      ? propulsionStep(world.state.ship.mass, controls, durationSeconds, world.state.ship.performance).mass
      : structuredClone(world.state.ship.mass),
    exhaustVelocity = world.state.ship.performance.specificImpulseSeconds * CONFIG.standardGravity,
    deltaVMps = exhaustVelocity * Math.log(
      (world.state.ship.mass.dryKg + world.state.ship.mass.modulesKg + world.state.ship.mass.cargoKg +
        world.state.ship.mass.ammunitionKg + world.state.ship.mass.propellantKg) /
      (expected.dryKg + expected.modulesKg + expected.cargoKg + expected.ammunitionKg + expected.propellantKg),
    );
  return {
    type: 'FAST',
    estimatedDeltaVMps: deltaVMps,
    estimatedPropellantKg: world.state.ship.mass.propellantKg - expected.propellantKg,
    waitSeconds: 0,
    transferDurationSeconds: durationSeconds,
    etaSeconds: durationSeconds,
    burns: [{ offsetSeconds: 0, durationSeconds, deltaVMps, steering: 'PROGRADE' }],
    expectedFinalState: { position: [...world.state.ship.position], velocity: [...world.state.ship.velocity] },
    expectedFinalMass: expected,
    expectedReserveDeltaVMps: availableDeltaV(expected, world.state.ship.performance.specificImpulseSeconds),
    verification: { positionErrorM: 0, radiusErrorM: 0, velocityErrorMps: 0 },
  };
}

function execute(durationSeconds: number) {
  const world = new World(), candidate = singleBurnCandidate(world, durationSeconds),
    startedAtMs = 1_800_000_000_000, initialFuel = world.state.ship.mass.propellantKg;
  expect(world.startManeuver(`burn-${durationSeconds}`, candidate, startedAtMs).ok).toBe(true);
  let ticks = 0;
  while (world.state.maneuver?.status !== 'COMPLETE' && ticks < 20) {
    ticks++;
    world.tick(ticks, startedAtMs + ticks * CONFIG.fixedDt * 1000);
  }
  return { world, candidate, ticks, consumedKg: initialFuel - world.state.ship.mass.propellantKg };
}

describe('authoritative partial-step maneuver burns', () => {
  it('does not integrate or consume fuel for a zero-duration burn', () => {
    const { world, ticks, consumedKg } = execute(0);
    expect(ticks).toBe(1);
    expect(world.state.tick).toBe(0);
    expect(world.state.maneuver?.burnElapsedSeconds).toBe(0);
    expect(consumedKg).toBe(0);
  });

  it.each([
    ['exact multiple', CONFIG.fixedDt * 2, 2],
    ['partial final step', CONFIG.fixedDt * 2.4, 3],
  ])('executes an %s without a full-step overshoot', (_label, durationSeconds, expectedSteps) => {
    const { world, candidate, consumedKg } = execute(durationSeconds);
    expect(world.state.tick).toBe(expectedSteps);
    expect(world.state.maneuver?.burnElapsedSeconds).toBeCloseTo(durationSeconds, 12);
    expect(world.state.ship.mass.propellantKg).toBeCloseTo(candidate.expectedFinalMass.propellantKg, 10);
    expect(consumedKg).toBeCloseTo(candidate.estimatedPropellantKg, 10);
    const executorImpulseNs = consumedKg * world.state.ship.performance.specificImpulseSeconds * CONFIG.standardGravity,
      plannerImpulseNs = world.state.ship.performance.mainThrustN * durationSeconds;
    expect(executorImpulseNs).toBeCloseTo(plannerImpulseNs, 6);
  });
});
