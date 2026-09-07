import { CONFIG, type Vec3 } from '@orbital/shared';
import { cross, dot, length } from './coordinates';

export interface OrbitalState {
  position: Vec3;
  velocity: Vec3;
}

export function assertValidOrbitalState(state: OrbitalState): void {
  if (
    [...state.position, ...state.velocity].some((value) => !Number.isFinite(value)) ||
    !(length(state.position) > CONFIG.earthRadius / 2)
  )
    throw new RangeError('Invalid orbital state');
}

export const specificOrbitalEnergy = (state: OrbitalState, mu: number = CONFIG.earthMu) => {
  assertValidOrbitalState(state);
  if (!Number.isFinite(mu) || mu <= 0) throw new RangeError('Invalid gravitational parameter');
  return dot(state.velocity, state.velocity) / 2 - mu / length(state.position);
};

export const specificAngularMomentum = (state: OrbitalState) => {
  assertValidOrbitalState(state);
  return cross(state.position, state.velocity);
};

const stumpff = (z: number) => {
  if (z > 1e-8) {
    const root = Math.sqrt(z);
    return { c: (1 - Math.cos(root)) / z, s: (root - Math.sin(root)) / root ** 3 };
  }
  if (z < -1e-8) {
    const root = Math.sqrt(-z);
    return { c: (Math.cosh(root) - 1) / -z, s: (Math.sinh(root) - root) / root ** 3 };
  }
  return { c: 1 / 2 - z / 24 + z ** 2 / 720, s: 1 / 6 - z / 120 + z ** 2 / 5040 };
};

/** Universal-variable two-body propagation. Suitable for unpowered coast phases. */
export function propagateKepler(
  state: OrbitalState,
  durationSeconds: number,
  mu: number = CONFIG.earthMu,
): OrbitalState {
  assertValidOrbitalState(state);
  if (!Number.isFinite(durationSeconds) || !Number.isFinite(mu) || mu <= 0)
    throw new RangeError('Invalid coast propagation input');
  if (durationSeconds === 0) return { position: [...state.position], velocity: [...state.velocity] };

  const r0 = length(state.position),
    v02 = dot(state.velocity, state.velocity),
    radialVelocity = dot(state.position, state.velocity) / r0,
    alpha = 2 / r0 - v02 / mu,
    sqrtMu = Math.sqrt(mu);
  let x =
    Math.abs(alpha) > 1e-12 ? sqrtMu * Math.abs(alpha) * durationSeconds : (sqrtMu * durationSeconds) / r0;
  for (let iteration = 0; iteration < 50; iteration++) {
    const z = alpha * x * x,
      { c, s } = stumpff(z),
      value =
        (r0 * radialVelocity * x * x * c) / sqrtMu +
        (1 - alpha * r0) * x ** 3 * s +
        r0 * x -
        sqrtMu * durationSeconds,
      derivative = (r0 * radialVelocity * x * (1 - z * s)) / sqrtMu + (1 - alpha * r0) * x * x * c + r0,
      correction = value / derivative;
    x -= correction;
    if (!Number.isFinite(x)) throw new RangeError('Kepler solver diverged');
    if (Math.abs(correction) < 1e-8) break;
    if (iteration === 49) throw new RangeError('Kepler solver did not converge');
  }
  const z = alpha * x * x,
    { c, s } = stumpff(z),
    f = 1 - (x * x * c) / r0,
    g = durationSeconds - (x ** 3 * s) / sqrtMu,
    position = state.position.map((value, index) => f * value + g * state.velocity[index]) as Vec3,
    radius = length(position),
    fDot = (sqrtMu / (radius * r0)) * (alpha * x ** 3 * s - x),
    gDot = 1 - (x * x * c) / radius,
    velocity = state.position.map((value, index) => fDot * value + gDot * state.velocity[index]) as Vec3;
  const result = { position, velocity };
  assertValidOrbitalState(result);
  return result;
}
