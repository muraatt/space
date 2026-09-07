import { describe, expect, it } from 'vitest';
import { CONFIG } from '@orbital/shared';
import { cross, length, sub } from './coordinates';
import { integrate } from './integrate';
import { propagateKepler, specificAngularMomentum, specificOrbitalEnergy } from './orbit';
import { initialWorld } from './step';

const relative = (before: number, after: number) => Math.abs((after - before) / before);

describe('two-body coast propagation', () => {
  it('conserves specific energy and angular momentum below the 1e-6 target', () => {
    const ship = initialWorld().ship;
    const initial = { position: ship.position, velocity: ship.velocity };
    const final = propagateKepler(initial, 6 * 3600);
    expect(relative(specificOrbitalEnergy(initial), specificOrbitalEnergy(final))).toBeLessThan(1e-12);
    expect(
      relative(length(specificAngularMomentum(initial)), length(specificAngularMomentum(final))),
    ).toBeLessThan(1e-12);
  });

  it('matches independent fixed-step RK4 within 10 m after the standard 10-minute coast', () => {
    const ship = initialWorld().ship;
    const initial = { position: ship.position, velocity: ship.velocity };
    const analytical = propagateKepler(initial, 600);
    let numerical = initial;
    for (let i = 0; i < 600 / CONFIG.fixedDt; i++)
      numerical = integrate(numerical.position, numerical.velocity, [0, 0, 0], CONFIG.fixedDt);
    expect(length(sub(analytical.position, numerical.position))).toBeLessThan(10);
  });

  it('replays deterministically and preserves an exact zero-duration boundary', () => {
    const ship = initialWorld('orbit_night', 42).ship;
    const input = { position: ship.position, velocity: ship.velocity };
    expect(propagateKepler(input, 1234.5)).toEqual(propagateKepler(input, 1234.5));
    expect(propagateKepler(input, 0)).toEqual(input);
    expect(propagateKepler(input, 0).position).not.toBe(input.position);
  });

  it('rejects invalid orbital inputs instead of propagating NaN or Infinity', () => {
    const ship = initialWorld().ship;
    expect(() => propagateKepler({ position: [0, 0, 0], velocity: ship.velocity }, 10)).toThrow(RangeError);
    expect(() => propagateKepler({ position: ship.position, velocity: [0, Number.NaN, 0] }, 10)).toThrow(
      RangeError,
    );
    expect(() =>
      propagateKepler({ position: ship.position, velocity: ship.velocity }, Number.POSITIVE_INFINITY),
    ).toThrow(RangeError);
    expect(length(cross(ship.position, ship.velocity))).toBeGreaterThan(0);
  });
});
