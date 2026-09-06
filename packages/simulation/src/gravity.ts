import { CONFIG, type Vec3 } from '@orbital/shared';
import { length, scale } from './coordinates';
export function gravity(position: Vec3): Vec3 {
  const r = length(position);
  if (!(r > CONFIG.earthRadius / 2)) throw new RangeError('Position outside gravity contract');
  return scale(position, -CONFIG.earthMu / (r * r * r));
}
