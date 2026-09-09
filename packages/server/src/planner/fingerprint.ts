import { CONFIG, type ManeuverTarget, type ShipState, type Vec3 } from '@orbital/shared';
import { length, propagateKepler, sub } from '@orbital/simulation';

export interface ManeuverPlanFingerprint {
  createdAtMs: number;
  epochMs: number;
  activeShipId: string;
  ship: {
    id: string;
    position: Vec3;
    velocity: Vec3;
    mass: ShipState['mass'];
    mainThrustN: number;
    translationThrustN: number;
    specificImpulseSeconds: number;
  };
  targetEntityId?: string;
  target: ManeuverTarget;
}

export function createManeuverPlanFingerprint(
  ship: ShipState,
  activeShipId: string,
  target: ManeuverTarget,
  createdAtMs: number,
  targetEntityId?: string,
  epochMs = createdAtMs,
): ManeuverPlanFingerprint {
  return structuredClone({
    createdAtMs,
    epochMs,
    activeShipId,
    ship: {
      id: ship.id,
      position: ship.position,
      velocity: ship.velocity,
      mass: ship.mass,
      mainThrustN: ship.performance.mainThrustN,
      translationThrustN: ship.performance.translationThrustN,
      specificImpulseSeconds: ship.performance.specificImpulseSeconds,
    },
    targetEntityId,
    target,
  });
}

const equalNumber = (a: number, b: number, tolerance = 1e-9) =>
  Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;

export function validateManeuverPlanFingerprint(
  fingerprint: ManeuverPlanFingerprint,
  ship: ShipState,
  activeShipId: string,
  currentTarget: ManeuverTarget,
  currentEpochMs: number,
  checkedAtMs = currentEpochMs,
) {
  const elapsedSeconds = (currentEpochMs - fingerprint.epochMs) / 1000;
  if (
    !Number.isFinite(elapsedSeconds) ||
    elapsedSeconds < 0 ||
    checkedAtMs - fingerprint.createdAtMs > CONFIG.maneuverPlanTtlMs
  )
    return { ok: false as const, code: 'REPLAN_REQUIRED', reason: 'PLAN_EXPIRED' };
  if (activeShipId !== fingerprint.activeShipId || ship.id !== fingerprint.ship.id || ship.id !== activeShipId)
    return { ok: false as const, code: 'REPLAN_REQUIRED', reason: 'ACTIVE_SHIP_CHANGED' };
  const expectedShip = propagateKepler(
    { position: fingerprint.ship.position, velocity: fingerprint.ship.velocity },
    elapsedSeconds,
  );
  if (length(sub(ship.position, expectedShip.position)) > CONFIG.maneuverFingerprintPositionToleranceM)
    return { ok: false as const, code: 'REPLAN_REQUIRED', reason: 'SHIP_POSITION_CHANGED' };
  if (length(sub(ship.velocity, expectedShip.velocity)) > CONFIG.maneuverFingerprintVelocityToleranceMps)
    return { ok: false as const, code: 'REPLAN_REQUIRED', reason: 'SHIP_VELOCITY_CHANGED' };
  for (const key of ['dryKg', 'modulesKg', 'cargoKg', 'ammunitionKg', 'propellantKg'] as const)
    if (!equalNumber(ship.mass[key], fingerprint.ship.mass[key], 1e-6))
      return { ok: false as const, code: 'REPLAN_REQUIRED', reason: 'SHIP_MASS_OR_FUEL_CHANGED' };
  if (
    !equalNumber(ship.performance.mainThrustN, fingerprint.ship.mainThrustN) ||
    !equalNumber(ship.performance.translationThrustN, fingerprint.ship.translationThrustN) ||
    !equalNumber(ship.performance.specificImpulseSeconds, fingerprint.ship.specificImpulseSeconds)
  ) return { ok: false as const, code: 'REPLAN_REQUIRED', reason: 'PROPULSION_CHANGED' };
  if (fingerprint.target.kind !== currentTarget.kind)
    return { ok: false as const, code: 'REPLAN_REQUIRED', reason: 'TARGET_CHANGED' };
  if (fingerprint.target.kind === 'NEAR_RENDEZVOUS_STATE' && currentTarget.kind === 'NEAR_RENDEZVOUS_STATE') {
    const expectedTarget = propagateKepler(fingerprint.target.state, elapsedSeconds);
    if (
      length(sub(currentTarget.state.position, expectedTarget.position)) > CONFIG.maneuverFingerprintTargetPositionToleranceM ||
      length(sub(currentTarget.state.velocity, expectedTarget.velocity)) > CONFIG.maneuverFingerprintTargetVelocityToleranceMps
    ) return { ok: false as const, code: 'REPLAN_REQUIRED', reason: 'TARGET_STATE_CHANGED' };
  } else if (
    fingerprint.target.kind === 'CIRCULAR_ORBIT' &&
    currentTarget.kind === 'CIRCULAR_ORBIT' &&
    (!equalNumber(fingerprint.target.radiusM, currentTarget.radiusM, 1e-6) ||
      !equalNumber(fingerprint.target.phaseAheadRad, currentTarget.phaseAheadRad, 1e-9))
  ) return { ok: false as const, code: 'REPLAN_REQUIRED', reason: 'TARGET_STATE_CHANGED' };
  return { ok: true as const, elapsedSeconds };
}

export function targetAtFingerprintEpoch(fingerprint: ManeuverPlanFingerprint, currentEpochMs: number): ManeuverTarget {
  if (fingerprint.target.kind !== 'NEAR_RENDEZVOUS_STATE') return structuredClone(fingerprint.target);
  return {
    kind: 'NEAR_RENDEZVOUS_STATE',
    state: propagateKepler(fingerprint.target.state, Math.max(0, (currentEpochMs - fingerprint.epochMs) / 1000)),
  };
}
