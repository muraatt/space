import { CONFIG, type MissileState, type Quat, type Vec3 } from '@orbital/shared';
import { add, dot, length, normalize, rotate, scale, sub } from './coordinates';

export function segmentSphereHit(start: Vec3, end: Vec3, center: Vec3, radiusM: number) {
  const segment = sub(end, start),
    segmentLength2 = dot(segment, segment),
    t = segmentLength2 > 0 ? Math.max(0, Math.min(1, dot(sub(center, start), segment) / segmentLength2)) : 0,
    closest = add(start, scale(segment, t));
  return length(sub(closest, center)) <= radiusM;
}

export function lineOfSightClear(start: Vec3, end: Vec3, occluded = false) {
  return !occluded && !segmentSphereHit(start, end, [0, 0, 0], CONFIG.earthRadius);
}

export function withinFiringArc(position: Vec3, orientation: Quat, target: Vec3) {
  const forward = normalize(rotate([0, 0, -1], orientation)),
    direction = normalize(sub(target, position)),
    threshold = Math.cos((CONFIG.laserArcDegrees * Math.PI) / 180);
  return dot(forward, direction) >= threshold;
}

export function stepGuidedMissile(missile: MissileState, targetPosition: Vec3, dt: number): MissileState {
  if (missile.status !== 'ACTIVE') return missile;
  const previousPosition = [...missile.position] as Vec3,
    desired = normalize(sub(targetPosition, missile.position)),
    guidanceAcceleration =
      missile.remainingPropulsionSeconds > 0
        ? scale(desired, CONFIG.missileAccelerationMps2)
        : ([0, 0, 0] as Vec3),
    velocity = add(missile.velocity, scale(guidanceAcceleration, dt)),
    position = add(missile.position, scale(velocity, dt)),
    remainingLifetimeSeconds = Math.max(0, missile.remainingLifetimeSeconds - dt),
    remainingPropulsionSeconds = Math.max(0, missile.remainingPropulsionSeconds - dt);
  return {
    ...missile,
    previousPosition,
    position,
    velocity,
    remainingLifetimeSeconds,
    remainingPropulsionSeconds,
    status: remainingLifetimeSeconds <= 0 ? 'EXPIRED' : missile.status,
  };
}
