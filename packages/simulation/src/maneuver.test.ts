import { describe, expect, it } from 'vitest';
import { CONFIG, type ManeuverTarget, type Vec3 } from '@orbital/shared';
import { totalMassKg } from './mass';
import { generateManeuverPlan } from './maneuver';
import { initialWorld } from './step';

const circularTarget = (altitudeM: number, phaseAheadRad: number): ManeuverTarget => ({
  kind: 'CIRCULAR_ORBIT',
  radiusM: CONFIG.earthRadius + altitudeM,
  phaseAheadRad,
});

describe('maneuver candidate generation', () => {
  it.each([
    ['higher', 800_000, 0.5],
    ['lower', 250_000, 0.4],
  ] as const)('builds distinct economic, balanced and fast %s-orbit transfers', (_, altitude, phase) => {
    const result = generateManeuverPlan(initialWorld().ship, circularTarget(altitude, phase));
    expect(result.rejected).toEqual([]);
    expect(result.candidates.map((candidate) => candidate.type)).toEqual(['ECONOMIC', 'BALANCED', 'FAST']);
    const [economic, balanced, fast] = result.candidates;
    expect(economic.estimatedDeltaVMps).toBeLessThan(balanced.estimatedDeltaVMps);
    expect(balanced.estimatedDeltaVMps).toBeLessThan(fast.estimatedDeltaVMps);
    expect(economic.etaSeconds).toBeGreaterThan(balanced.etaSeconds);
    expect(balanced.etaSeconds).toBeGreaterThan(fast.etaSeconds);
  });

  it('handles a same-plane near-rendezvous target with finite phasing orbits', () => {
    const world = initialWorld(),
      radius = Math.hypot(...world.ship.position),
      speed = Math.sqrt(CONFIG.earthMu / radius),
      phase = 0.3,
      position: Vec3 = [radius * Math.cos(phase), 0, -radius * Math.sin(phase)],
      velocity: Vec3 = [-speed * Math.sin(phase), 0, -speed * Math.cos(phase)],
      result = generateManeuverPlan(world.ship, {
        kind: 'NEAR_RENDEZVOUS_STATE',
        state: { position, velocity },
      });
    expect(result.candidates.map((candidate) => candidate.type)).toEqual(['ECONOMIC', 'BALANCED', 'FAST']);
    expect(result.candidates.every((candidate) => candidate.verification.positionErrorM < 10_000)).toBe(true);
  });

  it('verifies burns through mass-changing propagation and preserves valid reserves', () => {
    const ship = initialWorld().ship,
      candidate = generateManeuverPlan(ship, circularTarget(800_000, 0.5)).candidates[0];
    expect(candidate.burns).toHaveLength(2);
    expect(candidate.burns.every((burn) => burn.durationSeconds > 0)).toBe(true);
    expect(candidate.expectedFinalMass.propellantKg).toBeLessThan(ship.mass.propellantKg);
    expect(candidate.expectedFinalMass.propellantKg).toBeGreaterThanOrEqual(0);
    expect(totalMassKg(candidate.expectedFinalMass)).toBeCloseTo(
      ship.massKg - candidate.estimatedPropellantKg,
      8,
    );
    expect(candidate.verification.radiusErrorM).toBeLessThan(10_000);
    expect(candidate.verification.velocityErrorMps).toBeLessThan(5);
    expect(candidate.expectedReserveDeltaVMps).toBeGreaterThanOrEqual(0);
  });

  it('is deterministic and returns the representative orbit_maneuver scenario within one second', () => {
    const ship = initialWorld('orbit_day', 4401).ship,
      target = circularTarget(800_000, 0.5),
      started = performance.now(),
      first = generateManeuverPlan(ship, target),
      elapsed = performance.now() - started;
    expect(generateManeuverPlan(ship, target)).toEqual(first);
    expect(elapsed).toBeLessThan(1_000);
  });

  it('rejects insufficient propellant without mutating authoritative state', () => {
    const ship = structuredClone(initialWorld().ship),
      before = structuredClone(ship);
    ship.mass.propellantKg = 1;
    ship.massKg = totalMassKg(ship.mass);
    const input = structuredClone(ship),
      result = generateManeuverPlan(ship, circularTarget(800_000, 0.5));
    expect(result.candidates).toEqual([]);
    expect(result.rejected.every((rejection) => rejection.reason === 'INSUFFICIENT_PROPELLANT')).toBe(true);
    expect(ship).toEqual(input);
    expect(before.mass.propellantKg).toBe(2_000);
  });

  it('rejects invalid targets and impossible mass without NaN or mutation', () => {
    const ship = structuredClone(initialWorld().ship),
      before = structuredClone(ship),
      invalidTarget = generateManeuverPlan(ship, circularTarget(-1_000_000, 0));
    expect(invalidTarget.candidates).toEqual([]);
    expect(invalidTarget.rejected.every((rejection) => rejection.reason === 'INVALID_TARGET')).toBe(true);
    expect(ship).toEqual(before);

    const offPlane = generateManeuverPlan(ship, {
      kind: 'NEAR_RENDEZVOUS_STATE',
      state: {
        position: [0, CONFIG.earthRadius + 400_000, 0],
        velocity: [0, 0, -7_668],
      },
    });
    expect(offPlane.candidates).toEqual([]);
    expect(offPlane.rejected.every((rejection) => rejection.reason === 'NO_FEASIBLE_TRANSFER')).toBe(true);

    ship.mass.propellantKg = -1;
    const invalidMass = generateManeuverPlan(ship, circularTarget(800_000, 0));
    expect(invalidMass.candidates).toEqual([]);
    expect(invalidMass.rejected.every((rejection) => rejection.reason === 'NO_FEASIBLE_TRANSFER')).toBe(true);
    expect(JSON.stringify(invalidMass)).not.toContain('NaN');
  });
});
