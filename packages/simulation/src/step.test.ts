import { describe, expect, it } from 'vitest';
import { CONFIG } from '@orbital/shared';
import { initialWorld, step } from './step';
import { length, sub, cross } from './coordinates';
import { seededRandom } from './rng';
describe('fixed-step central gravity', () => {
  it('tracks an independent circular-orbit solution for 60 seconds', () => {
    let w = initialWorld();
    const r = length(w.ship.position),
      n = Math.sqrt(CONFIG.earthMu / r ** 3);
    for (let i = 0; i < 3600; i++) w = step(w);
    const expected: [number, number, number] = [r * Math.cos(n * 60), 0, -r * Math.sin(n * 60)];
    expect(length(sub(w.ship.position, expected))).toBeLessThan(0.01);
    const h = length(cross(w.ship.position, w.ship.velocity));
    expect(h / (r * Math.sqrt(CONFIG.earthMu / r)) - 1).toBeCloseTo(0, 10);
  });
  it('applies 24 kN to 8 tonnes without cancelling orbital velocity', () => {
    let coast = initialWorld(),
      powered = initialWorld();
    powered.controls.translation = [0, 0, -1];
    for (let i = 0; i < 60; i++) {
      coast = step(coast);
      powered = step(powered);
    }
    expect(length(sub(powered.ship.velocity, coast.ship.velocity))).toBeCloseTo(3, 3);
    expect(length(powered.ship.velocity)).toBeGreaterThan(7600);
    expect(powered.ship.massKg).toBe(CONFIG.massKg);
  });
  it('bounds attitude actuation and keeps orientation normalized', () => {
    let w = initialWorld();
    w.controls.rotation = [1, -1, 1];
    for (let i = 0; i < 600; i++) w = step(w);
    expect(Math.hypot(...w.ship.orientation)).toBeCloseTo(1, 12);
    expect(Math.max(...w.ship.angularVelocity.map(Math.abs))).toBeLessThanOrEqual(CONFIG.angularRate);
  });
  it('replays the same commands and seed exactly in the pinned runtime', () => {
    const run = () => {
      let w = initialWorld('orbit_night', 42);
      const r = seededRandom(w.seed);
      for (let i = 0; i < 1200; i++) {
        if (i % 60 === 0) w.controls.translation = [r() * 2 - 1, 0, r() * 2 - 1];
        w = step(w);
      }
      return w;
    };
    expect(run()).toEqual(run());
  });
});
