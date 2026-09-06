import { describe, expect, it } from 'vitest';
import { initialWorld } from './step';
import { orbitalBasis, toLocal, rotate, multiplyQuat, normalizedQuat, length, dot } from './coordinates';
describe('SI ECI and camera-relative coordinates', () => {
  it('preserves centimetre separation at Earth orbital distance', () => {
    const s = initialWorld().ship,
      b = orbitalBasis(s.position, s.velocity);
    const p: [number, number, number] = [s.position[0] + 0.01, 0, 0];
    const l = toLocal(p, s.position, b);
    expect(l[1]).toBeCloseTo(0.01, 7);
    expect(l[0]).toBe(0);
  });
  it('gives a right-handed orthonormal orbit basis', () => {
    const s = initialWorld().ship,
      b = orbitalBasis(s.position, s.velocity);
    expect(length(b.up)).toBeCloseTo(1, 14);
    expect(dot(b.up, b.right)).toBeCloseTo(0, 14);
    expect(toLocal([0, 0, 0], s.position, b)[1]).toBeCloseTo(-length(s.position), 8);
  });
  it('maps body forward to initial prograde and reverses a quaternion transform', () => {
    const q = initialWorld().ship.orientation;
    expect(rotate([0, 0, -1], q)[2]).toBeCloseTo(-1, 14);
    const v: [number, number, number] = [1, 2, 3];
    const q2 = normalizedQuat(multiplyQuat(q, [0.1, 0.2, 0.3, 0.9]));
    const out = rotate(rotate(v, q2), [-q2[0], -q2[1], -q2[2], q2[3]]);
    out.forEach((n, i) => expect(n).toBeCloseTo(v[i], 12));
  });
  it('does not mutate the physics origin while drawing', () => {
    const s = initialWorld().ship,
      before = JSON.stringify(s);
    toLocal([0, 0, 0], s.position, orbitalBasis(s.position, s.velocity));
    expect(JSON.stringify(s)).toBe(before);
  });
});
