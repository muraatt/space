import type { Vec3, Quat } from '@orbital/shared';
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const length = (a: Vec3) => Math.hypot(...a);
export const normalize = (a: Vec3): Vec3 => scale(a, 1 / (length(a) || 1));
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export function multiplyQuat(a: Quat, b: Quat): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
export const normalizedQuat = (q: Quat): Quat => {
  const l = Math.hypot(...q);
  return q.map((x) => x / l) as Quat;
};
export function rotate(v: Vec3, q: Quat): Vec3 {
  const result = multiplyQuat(multiplyQuat(q, [...v, 0]), [-q[0], -q[1], -q[2], q[3]]);
  return [result[0], result[1], result[2]];
}
export function orbitalBasis(position: Vec3, velocity: Vec3) {
  const up = normalize(position),
    right = normalize(cross(velocity, up)),
    back = normalize(cross(right, up));
  return { right, up, back };
}
export function toLocal(position: Vec3, origin: Vec3, basis: ReturnType<typeof orbitalBasis>): Vec3 {
  const d = sub(position, origin);
  return [dot(d, basis.right), dot(d, basis.up), dot(d, basis.back)];
}
