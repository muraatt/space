import type { Vec3 } from '@orbital/shared';
import { add, scale } from './coordinates';
import { gravity } from './gravity';
/** Fixed-step RK4. Constant body-thrust acceleration over one micro-step. */
export function integrate(position: Vec3, velocity: Vec3, thrust: Vec3, dt: number) {
  const acc = (p: Vec3) => add(gravity(p), thrust);
  const a1 = acc(position),
    v1 = velocity;
  const v2 = add(velocity, scale(a1, dt / 2)),
    a2 = acc(add(position, scale(v1, dt / 2)));
  const v3 = add(velocity, scale(a2, dt / 2)),
    a3 = acc(add(position, scale(v2, dt / 2)));
  const v4 = add(velocity, scale(a3, dt)),
    a4 = acc(add(position, scale(v3, dt)));
  const sum = (a: Vec3, b: Vec3, c: Vec3, d: Vec3) =>
    scale(add(add(a, scale(b, 2)), add(scale(c, 2), d)), dt / 6);
  return { position: add(position, sum(v1, v2, v3, v4)), velocity: add(velocity, sum(a1, a2, a3, a4)) };
}
