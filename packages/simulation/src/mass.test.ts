import { describe, expect, it } from 'vitest';
import { CONFIG, neutralControls, type MassState } from '@orbital/shared';
import { availableDeltaV, propellantForForce, totalMassKg } from './mass';
import { propulsionStep } from './propulsion';
import { initialWorld, step } from './step';

const mass = (propellantKg: number): MassState => ({
  dryKg: 6000,
  modulesKg: 250,
  cargoKg: 500,
  ammunitionKg: 50,
  propellantKg,
});

describe('spacecraft mass and chemical propulsion', () => {
  it('uses the independent Tsiolkovsky rocket equation', () => {
    const state = mass(1200);
    const expected = CONFIG.specificImpulseSeconds * CONFIG.standardGravity * Math.log(8000 / 6800);
    expect(totalMassKg(state)).toBe(8000);
    expect(availableDeltaV(state)).toBeCloseTo(expected, 12);
    expect(availableDeltaV(mass(0))).toBe(0);
  });

  it('consumes force / exhaust velocity and evolves total mass', () => {
    const controls = neutralControls();
    controls.translation = [0, 0, -1];
    const result = propulsionStep(mass(1200), controls, 10);
    const expected = (CONFIG.mainThrustN * 10) / (CONFIG.specificImpulseSeconds * CONFIG.standardGravity);
    expect(result.consumedPropellantKg).toBeCloseTo(expected, 12);
    expect(result.mass.propellantKg).toBeCloseTo(1200 - expected, 12);
    expect(Math.abs(result.massKg - (8000 - expected))).toBeLessThan(1e-9);
    expect(result.bodyAcceleration[2]).toBeLessThan(0);
  });

  it('cuts off exactly at propellant exhaustion and never creates negative mass', () => {
    const controls = neutralControls();
    controls.translation = [0, 0, -1];
    const tiny = propulsionStep(mass(0.01), controls, 10);
    expect(tiny.mass.propellantKg).toBe(0);
    expect(tiny.consumedPropellantKg).toBe(0.01);
    expect(tiny.thrustFraction).toBeGreaterThan(0);
    expect(tiny.thrustFraction).toBeLessThan(1);
    const empty = propulsionStep(tiny.mass, controls, 10);
    expect(empty.bodyAcceleration).toEqual([0, 0, -0]);
    expect(empty.consumedPropellantKg).toBe(0);
    expect(empty.massKg).toBe(totalMassKg(tiny.mass));
  });

  it('rejects impossible or non-finite propulsion states', () => {
    expect(() => totalMassKg({ ...mass(1), propellantKg: -1 })).toThrow(RangeError);
    expect(() => totalMassKg({ ...mass(1), cargoKg: Number.NaN })).toThrow(RangeError);
    expect(() => availableDeltaV(mass(1), 0)).toThrow(RangeError);
    expect(() => propellantForForce(Number.POSITIVE_INFINITY, 1, 1)).toThrow(RangeError);
    const inconsistent = initialWorld();
    inconsistent.ship.massKg -= 1;
    expect(() => step(inconsistent)).toThrow(/inconsistent/);
  });
});
