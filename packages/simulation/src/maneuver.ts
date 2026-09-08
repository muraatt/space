import {
  CONFIG,
  type ManeuverCandidate,
  type ManeuverCandidateType,
  type ManeuverPlanResult,
  type ManeuverRejectionReason,
  type ManeuverTarget,
  type MassState,
  type PlannedBurn,
  type ShipState,
  type ShipPerformance,
  type Vec3,
} from '@orbital/shared';
import { add, cross, dot, length, normalize, rotate, scale, sub } from './coordinates';
import { integrate } from './integrate';
import { availableDeltaV, totalMassKg } from './mass';
import { assertValidOrbitalState, propagateKepler, type OrbitalState } from './orbit';
import { propulsionStep } from './propulsion';

const TWO_PI = Math.PI * 2;
const MIN_ALTITUDE_M = 120_000;
const RADIUS_TOLERANCE_M = 10_000;
const POSITION_TOLERANCE_M = 10_000;
const VELOCITY_TOLERANCE_MPS = 5;

class PlannerFailure extends Error {
  constructor(readonly reason: ManeuverRejectionReason) {
    super(reason);
  }
}

interface ResolvedTarget {
  radiusM: number;
  phaseAheadRad: number;
  initialState: OrbitalState;
  normal: Vec3;
  direction: 1 | -1;
}

interface BurnResult {
  state: OrbitalState;
  mass: MassState;
  durationSeconds: number;
  propellantKg: number;
}

type RawCandidate = Omit<ManeuverCandidate, 'type'>;

const mod = (value: number, divisor = TWO_PI) => ((value % divisor) + divisor) % divisor;

function signedAngle(from: Vec3, to: Vec3, normal: Vec3) {
  return Math.atan2(dot(cross(normalize(from), normalize(to)), normal), dot(normalize(from), normalize(to)));
}

function rotateAround(value: Vec3, axis: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  return add(add(scale(value, c), scale(cross(axis, value), s)), scale(axis, dot(axis, value) * (1 - c)));
}

function tangential(position: Vec3, normal: Vec3, direction: 1 | -1): Vec3 {
  return scale(normalize(cross(normal, position)), direction);
}

function circularVelocity(position: Vec3, normal: Vec3, direction: 1 | -1, radiusM = length(position)): Vec3 {
  return scale(tangential(position, normal, direction), Math.sqrt(CONFIG.earthMu / radiusM));
}

export function orientationForBodyMinusZ(direction: Vec3): [number, number, number, number] {
  const from: Vec3 = [0, 0, -1],
    to = normalize(direction),
    cosine = dot(from, to);
  if (cosine < -0.999999) return [0, 1, 0, 0];
  const axis = cross(from, to),
    q: [number, number, number, number] = [axis[0], axis[1], axis[2], 1 + cosine],
    qLength = Math.hypot(...q);
  return q.map((value) => value / qLength) as [number, number, number, number];
}

function simulateFiniteBurn(
  initialState: OrbitalState,
  initialMass: MassState,
  deltaVMps: number,
  directionAt: (state: OrbitalState) => Vec3,
  performance: ShipPerformance,
): BurnResult {
  if (!Number.isFinite(deltaVMps) || deltaVMps < 0) throw new PlannerFailure('NO_FEASIBLE_TRANSFER');
  const exhaustVelocity = performance.specificImpulseSeconds * CONFIG.standardGravity,
    initialTotal = totalMassKg(initialMass),
    requiredPropellant = initialTotal * (1 - Math.exp(-deltaVMps / exhaustVelocity));
  if (requiredPropellant > initialMass.propellantKg + 1e-9)
    throw new PlannerFailure('INSUFFICIENT_PROPELLANT');
  if (deltaVMps > availableDeltaV(initialMass) + 1e-9) throw new PlannerFailure('INSUFFICIENT_DELTA_V');

  let state = { position: [...initialState.position] as Vec3, velocity: [...initialState.velocity] as Vec3 },
    mass = { ...initialMass },
    remaining = requiredPropellant,
    durationSeconds = 0;
  while (remaining > 1e-10) {
    const duration = Math.min(CONFIG.fixedDt, (remaining * exhaustVelocity) / performance.mainThrustN),
      controls = { translation: [0, 0, -1] as Vec3, rotation: [0, 0, 0] as Vec3 },
      propulsion = propulsionStep(mass, controls, duration, performance),
      orientation = orientationForBodyMinusZ(directionAt(state)),
      acceleration = rotate(propulsion.bodyAcceleration, orientation);
    state = integrate(state.position, state.velocity, acceleration, duration);
    mass = propulsion.mass;
    remaining = Math.max(0, remaining - propulsion.consumedPropellantKg);
    durationSeconds += duration;
    if (!Number.isFinite(durationSeconds) || durationSeconds > 3_600)
      throw new PlannerFailure('NO_FEASIBLE_TRANSFER');
  }
  assertValidOrbitalState(state);
  return {
    state,
    mass,
    durationSeconds,
    propellantKg: initialMass.propellantKg - mass.propellantKg,
  };
}

function resolveTarget(ship: ShipState, target: ManeuverTarget): ResolvedTarget {
  const shipState = { position: ship.position, velocity: ship.velocity };
  assertValidOrbitalState(shipState);
  const radius = length(ship.position),
    radialSpeed = dot(ship.position, ship.velocity) / radius,
    circularSpeed = Math.sqrt(CONFIG.earthMu / radius),
    normal = normalize(cross(ship.position, ship.velocity)),
    direction: 1 | -1 = 1;
  if (
    Math.abs(radialSpeed) > 50 ||
    Math.abs(length(ship.velocity) - circularSpeed) > 75 ||
    length(normal) < 0.99
  )
    throw new PlannerFailure('NO_FEASIBLE_TRANSFER');

  if (target.kind === 'CIRCULAR_ORBIT') {
    if (!Number.isFinite(target.radiusM) || target.radiusM < CONFIG.earthRadius + MIN_ALTITUDE_M)
      throw new PlannerFailure('INVALID_TARGET');
    const phase = mod(target.phaseAheadRad),
      position = scale(rotateAround(normalize(ship.position), normal, phase), target.radiusM);
    return {
      radiusM: target.radiusM,
      phaseAheadRad: phase,
      initialState: { position, velocity: circularVelocity(position, normal, direction, target.radiusM) },
      normal,
      direction,
    };
  }

  try {
    assertValidOrbitalState(target.state);
  } catch {
    throw new PlannerFailure('INVALID_TARGET');
  }
  const targetRadius = length(target.state.position),
    planeOffset = Math.abs(dot(target.state.position, normal)) / targetRadius,
    targetRadialSpeed = dot(target.state.position, target.state.velocity) / targetRadius,
    targetCircularSpeed = Math.sqrt(CONFIG.earthMu / targetRadius),
    targetNormal = normalize(cross(target.state.position, target.state.velocity));
  if (
    targetRadius < CONFIG.earthRadius + MIN_ALTITUDE_M ||
    planeOffset > 1e-4 ||
    dot(normal, targetNormal) < 0.9999 ||
    Math.abs(targetRadialSpeed) > 25 ||
    Math.abs(length(target.state.velocity) - targetCircularSpeed) > 50
  )
    throw new PlannerFailure('NO_FEASIBLE_TRANSFER');
  return {
    radiusM: targetRadius,
    phaseAheadRad: mod(signedAngle(ship.position, target.state.position, normal)),
    initialState: {
      position: [...target.state.position],
      velocity: [...target.state.velocity],
    },
    normal,
    direction,
  };
}

function coastToRadius(state: OrbitalState, targetRadiusM: number, raising: boolean) {
  const energy = dot(state.velocity, state.velocity) / 2 - CONFIG.earthMu / length(state.position);
  if (!(energy < 0)) throw new PlannerFailure('NO_FEASIBLE_TRANSFER');
  const semimajor = -CONFIG.earthMu / (2 * energy),
    halfPeriod = Math.PI * Math.sqrt(semimajor ** 3 / CONFIG.earthMu);
  let low = 0,
    high = halfPeriod;
  const highRadius = length(propagateKepler(state, high).position);
  if (
    (raising && highRadius < targetRadiusM - RADIUS_TOLERANCE_M) ||
    (!raising && highRadius > targetRadiusM + RADIUS_TOLERANCE_M)
  )
    throw new PlannerFailure('NO_FEASIBLE_TRANSFER');
  if (Math.abs(highRadius - targetRadiusM) <= 1) return high;
  for (let iteration = 0; iteration < 60; iteration++) {
    const middle = (low + high) / 2,
      radius = length(propagateKepler(state, middle).position);
    if ((raising && radius < targetRadiusM) || (!raising && radius > targetRadiusM)) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

function targetAt(target: ResolvedTarget, seconds: number): OrbitalState {
  return propagateKepler(target.initialState, seconds);
}

function solveLinear3(matrix: number[][], rhs: Vec3): Vec3 | undefined {
  const rows = matrix.map((row, index) => [...row, rhs[index]]);
  for (let column = 0; column < 3; column++) {
    let pivot = column;
    for (let row = column + 1; row < 3; row++)
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    if (Math.abs(rows[pivot][column]) < 1e-9) return undefined;
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    for (let item = column; item < 4; item++) rows[column][item] /= divisor;
    for (let row = 0; row < 3; row++) {
      if (row === column) continue;
      const factor = rows[row][column];
      for (let item = column; item < 4; item++) rows[row][item] -= factor * rows[column][item];
    }
  }
  return [rows[0][3], rows[1][3], rows[2][3]];
}

/** Finite-burn shooting solution for nearby objects that share an orbital plane. */
function runLocalRendezvous(ship: ShipState, target: ResolvedTarget, coastSeconds: number): RawCandidate {
  const initial: OrbitalState = { position: ship.position, velocity: ship.velocity },
    expectedAtBurn = targetAt(target, coastSeconds),
    nominalArrival = propagateKepler(initial, coastSeconds);
  let departureVector = scale(sub(expectedAtBurn.position, nominalArrival.position), 1 / coastSeconds);
  const fly = (vector: Vec3) => {
    const arrivalState = propagateKepler(
      { position: initial.position, velocity: add(initial.velocity, vector) },
      coastSeconds,
    );
    return { arrivalState };
  };
  for (let iteration = 0; iteration < 8; iteration++) {
    const base = fly(departureVector), error = sub(expectedAtBurn.position, base.arrivalState.position);
    if (length(error) < 2) break;
    const epsilon = 0.05,
      columns = ([0, 1, 2] as const).map((axis) => {
        const perturbed = [...departureVector] as Vec3;
        perturbed[axis] += epsilon;
        return scale(sub(fly(perturbed).arrivalState.position, base.arrivalState.position), 1 / epsilon);
      }),
      correction = solveLinear3(
        [
          [columns[0][0], columns[1][0], columns[2][0]],
          [columns[0][1], columns[1][1], columns[2][1]],
          [columns[0][2], columns[1][2], columns[2][2]],
        ],
        error,
      );
    if (!correction || !correction.every(Number.isFinite)) throw new PlannerFailure('NO_FEASIBLE_TRANSFER');
    const capped = length(correction) > 150 ? scale(correction, 150 / length(correction)) : correction;
    departureVector = add(departureVector, capped);
  }
  const flown = fly(departureVector),
    departureDirection = length(departureVector) > 1e-9
      ? normalize(departureVector)
      : tangential(initial.position, target.normal, target.direction),
    departure = simulateFiniteBurn(
      initial,
      ship.mass,
      length(departureVector),
      () => departureDirection,
      ship.performance,
    ),
    arrivalVector = sub(expectedAtBurn.velocity, flown.arrivalState.velocity),
    arrivalDeltaV = length(arrivalVector),
    arrival = simulateFiniteBurn(
      flown.arrivalState,
      departure.mass,
      arrivalDeltaV,
      (state) => sub(expectedAtBurn.velocity, state.velocity),
      ship.performance,
    ),
    etaSeconds = coastSeconds + arrival.durationSeconds,
    expectedTarget = targetAt(target, etaSeconds),
    positionErrorM = length(sub(flown.arrivalState.position, expectedAtBurn.position)),
    radiusErrorM = Math.abs(length(flown.arrivalState.position) - length(expectedAtBurn.position)),
    velocityErrorMps = length(sub(add(flown.arrivalState.velocity, arrivalVector), expectedAtBurn.velocity));
  if (positionErrorM > POSITION_TOLERANCE_M || radiusErrorM > RADIUS_TOLERANCE_M || velocityErrorMps > VELOCITY_TOLERANCE_MPS)
    throw new PlannerFailure('ARRIVAL_TOLERANCE_NOT_MET');
  return {
    estimatedDeltaVMps: length(departureVector) + arrivalDeltaV,
    estimatedPropellantKg: ship.mass.propellantKg - arrival.mass.propellantKg,
    waitSeconds: 0,
    transferDurationSeconds: etaSeconds,
    etaSeconds,
    burns: [
      {
        offsetSeconds: 0,
        durationSeconds: departure.durationSeconds,
        deltaVMps: length(departureVector),
        steering: 'INERTIAL_VECTOR',
        direction: departureDirection,
      },
      {
        offsetSeconds: coastSeconds,
        durationSeconds: arrival.durationSeconds,
        deltaVMps: arrivalDeltaV,
        steering: 'MATCH_TARGET_VELOCITY',
      },
    ],
    expectedFinalState: expectedTarget,
    expectedFinalMass: arrival.mass,
    expectedReserveDeltaVMps: availableDeltaV(arrival.mass, ship.performance.specificImpulseSeconds),
    verification: { positionErrorM, radiusErrorM, velocityErrorMps },
  };
}

function waitForPhase(
  phaseAhead: number,
  n1: number,
  n2: number,
  executionSeconds: number,
  transferAngle: number,
) {
  const relativeRate = n1 - n2,
    rhs = phaseAhead + n2 * executionSeconds - transferAngle;
  if (Math.abs(relativeRate) < 1e-12) return 0;
  return relativeRate > 0 ? mod(rhs) / relativeRate : mod(-rhs) / -relativeRate;
}

function runRadialTransfer(ship: ShipState, target: ResolvedTarget, departureDeltaV: number): RawCandidate {
  const initial: OrbitalState = { position: ship.position, velocity: ship.velocity },
    radius1 = length(ship.position),
    raising = target.radiusM > radius1,
    departureSign = raising ? 1 : -1,
    runFrom = (start: OrbitalState, mass: MassState) => {
      const departure = simulateFiniteBurn(
          start,
          mass,
          departureDeltaV,
          (state) => scale(tangential(state.position, target.normal, target.direction), departureSign),
          ship.performance,
        ),
        crossingSeconds = coastToRadius(departure.state, target.radiusM, raising),
        crossingState = propagateKepler(departure.state, crossingSeconds),
        crossingVelocity = circularVelocity(
          crossingState.position,
          target.normal,
          target.direction,
          target.radiusM,
        ),
        crossingDeltaV = length(sub(crossingVelocity, crossingState.velocity)),
        exhaustVelocity = ship.performance.specificImpulseSeconds * CONFIG.standardGravity,
        estimatedArrivalPropellant =
          totalMassKg(departure.mass) * (1 - Math.exp(-crossingDeltaV / exhaustVelocity)),
        estimatedArrivalDuration =
          (estimatedArrivalPropellant * exhaustVelocity) / ship.performance.mainThrustN,
        coastSeconds = Math.max(0, crossingSeconds - estimatedArrivalDuration / 2),
        arrivalState = propagateKepler(departure.state, coastSeconds),
        desiredVelocity = circularVelocity(
          arrivalState.position,
          target.normal,
          target.direction,
          target.radiusM,
        ),
        arrivalDeltaV = length(sub(desiredVelocity, arrivalState.velocity)),
        arrival = simulateFiniteBurn(
          arrivalState,
          departure.mass,
          arrivalDeltaV,
          (state) =>
            sub(
              circularVelocity(state.position, target.normal, target.direction, target.radiusM),
              state.velocity,
            ),
          ship.performance,
        );
      return { departure, coastSeconds, arrival, arrivalDeltaV };
    };

  const probe = runFrom(initial, ship.mass),
    probeDuration = probe.departure.durationSeconds + probe.coastSeconds + probe.arrival.durationSeconds,
    transferAngle = mod(signedAngle(initial.position, probe.arrival.state.position, target.normal)),
    n1 = Math.sqrt(CONFIG.earthMu / radius1 ** 3),
    n2 = Math.sqrt(CONFIG.earthMu / target.radiusM ** 3),
    waitSeconds = waitForPhase(target.phaseAheadRad, n1, n2, probeDuration, transferAngle),
    waitedState = propagateKepler(initial, waitSeconds),
    executed = runFrom(waitedState, ship.mass),
    transferDurationSeconds =
      executed.departure.durationSeconds + executed.coastSeconds + executed.arrival.durationSeconds,
    etaSeconds = waitSeconds + transferDurationSeconds,
    expectedTarget = targetAt(target, etaSeconds),
    finalState = executed.arrival.state,
    positionErrorM = length(sub(finalState.position, expectedTarget.position)),
    radiusErrorM = Math.abs(length(finalState.position) - target.radiusM),
    velocityErrorMps = length(sub(finalState.velocity, expectedTarget.velocity));
  if (
    positionErrorM > POSITION_TOLERANCE_M ||
    radiusErrorM > RADIUS_TOLERANCE_M ||
    velocityErrorMps > VELOCITY_TOLERANCE_MPS
  )
    throw new PlannerFailure('ARRIVAL_TOLERANCE_NOT_MET');
  const propellantKg = ship.mass.propellantKg - executed.arrival.mass.propellantKg,
    burns: PlannedBurn[] = [
      {
        offsetSeconds: waitSeconds,
        durationSeconds: executed.departure.durationSeconds,
        deltaVMps: departureDeltaV,
        steering: raising ? 'PROGRADE' : 'RETROGRADE',
      },
      {
        offsetSeconds: waitSeconds + executed.departure.durationSeconds + executed.coastSeconds,
        durationSeconds: executed.arrival.durationSeconds,
        deltaVMps: executed.arrivalDeltaV,
        steering: 'MATCH_TARGET_VELOCITY',
      },
    ];
  return {
    estimatedDeltaVMps: departureDeltaV + executed.arrivalDeltaV,
    estimatedPropellantKg: propellantKg,
    waitSeconds,
    transferDurationSeconds,
    etaSeconds,
    burns,
    expectedFinalState: finalState,
    expectedFinalMass: executed.arrival.mass,
    expectedReserveDeltaVMps: availableDeltaV(executed.arrival.mass, ship.performance.specificImpulseSeconds),
    verification: { positionErrorM, radiusErrorM, velocityErrorMps },
  };
}

function runPhasingTransfer(ship: ShipState, target: ResolvedTarget, revolutions: number): RawCandidate {
  const initial: OrbitalState = { position: ship.position, velocity: ship.velocity },
    radius = length(ship.position),
    circularPeriod = TWO_PI * Math.sqrt(radius ** 3 / CONFIG.earthMu),
    totalPhasingTime = ((TWO_PI * revolutions - target.phaseAheadRad) / TWO_PI) * circularPeriod,
    phasingPeriod = totalPhasingTime / revolutions,
    semimajor = Math.cbrt((CONFIG.earthMu * phasingPeriod ** 2) / (4 * Math.PI ** 2)),
    oppositeApsis = 2 * semimajor - radius;
  if (oppositeApsis < CONFIG.earthRadius + MIN_ALTITUDE_M || semimajor >= radius)
    throw new PlannerFailure('NO_FEASIBLE_TRANSFER');
  const circularSpeed = Math.sqrt(CONFIG.earthMu / radius),
    phasingSpeed = Math.sqrt(CONFIG.earthMu * (2 / radius - 1 / semimajor)),
    departureDeltaV = circularSpeed - phasingSpeed,
    departure = simulateFiniteBurn(
      initial,
      ship.mass,
      departureDeltaV,
      (state) => scale(tangential(state.position, target.normal, target.direction), -1),
      ship.performance,
    ),
    energy =
      dot(departure.state.velocity, departure.state.velocity) / 2 -
      CONFIG.earthMu / length(departure.state.position),
    actualSemimajor = -CONFIG.earthMu / (2 * energy),
    coastSeconds = Math.max(
      0,
      revolutions * TWO_PI * Math.sqrt(actualSemimajor ** 3 / CONFIG.earthMu) - departure.durationSeconds / 2,
    ),
    arrivalState = propagateKepler(departure.state, coastSeconds),
    desiredVelocity = circularVelocity(arrivalState.position, target.normal, target.direction, radius),
    arrivalDeltaV = length(sub(desiredVelocity, arrivalState.velocity)),
    arrival = simulateFiniteBurn(
      arrivalState,
      departure.mass,
      arrivalDeltaV,
      (state) =>
        sub(circularVelocity(state.position, target.normal, target.direction, radius), state.velocity),
      ship.performance,
    ),
    etaSeconds = departure.durationSeconds + coastSeconds + arrival.durationSeconds,
    expectedTarget = targetAt(target, etaSeconds),
    positionErrorM = length(sub(arrival.state.position, expectedTarget.position)),
    radiusErrorM = Math.abs(length(arrival.state.position) - radius),
    velocityErrorMps = length(sub(arrival.state.velocity, expectedTarget.velocity));
  if (
    positionErrorM > POSITION_TOLERANCE_M ||
    radiusErrorM > RADIUS_TOLERANCE_M ||
    velocityErrorMps > VELOCITY_TOLERANCE_MPS
  )
    throw new PlannerFailure('ARRIVAL_TOLERANCE_NOT_MET');
  return {
    estimatedDeltaVMps: departureDeltaV + arrivalDeltaV,
    estimatedPropellantKg: ship.mass.propellantKg - arrival.mass.propellantKg,
    waitSeconds: 0,
    transferDurationSeconds: etaSeconds,
    etaSeconds,
    burns: [
      {
        offsetSeconds: 0,
        durationSeconds: departure.durationSeconds,
        deltaVMps: departureDeltaV,
        steering: 'RETROGRADE',
      },
      {
        offsetSeconds: departure.durationSeconds + coastSeconds,
        durationSeconds: arrival.durationSeconds,
        deltaVMps: arrivalDeltaV,
        steering: 'MATCH_TARGET_VELOCITY',
      },
    ],
    expectedFinalState: arrival.state,
    expectedFinalMass: arrival.mass,
    expectedReserveDeltaVMps: availableDeltaV(arrival.mass, ship.performance.specificImpulseSeconds),
    verification: { positionErrorM, radiusErrorM, velocityErrorMps },
  };
}

function distinct(a: RawCandidate, b: RawCandidate) {
  return (
    Math.abs(a.estimatedDeltaVMps - b.estimatedDeltaVMps) > Math.max(1, a.estimatedDeltaVMps * 0.01) ||
    Math.abs(a.etaSeconds - b.etaSeconds) > Math.max(10, a.etaSeconds * 0.01)
  );
}

function selectCandidates(raw: RawCandidate[]): ManeuverCandidate[] {
  if (raw.length === 0) return [];
  const selected: ManeuverCandidate[] = [],
    economic = raw.reduce((best, item) => (item.estimatedDeltaVMps < best.estimatedDeltaVMps ? item : best));
  selected.push({ type: 'ECONOMIC', ...economic });
  const fastPool = raw.filter((item) => distinct(item, economic));
  if (fastPool.length === 0) return selected;
  const fast = fastPool.reduce((best, item) => (item.etaSeconds < best.etaSeconds ? item : best));
  const balancedPool = raw.filter((item) => distinct(item, economic) && distinct(item, fast));
  if (balancedPool.length) {
    const minDv = economic.estimatedDeltaVMps,
      maxDv = Math.max(...raw.map((item) => item.estimatedDeltaVMps)),
      minTime = Math.min(...raw.map((item) => item.etaSeconds)),
      maxTime = Math.max(...raw.map((item) => item.etaSeconds)),
      balanced = balancedPool.reduce((best, item) => {
        const score =
            (item.estimatedDeltaVMps - minDv) / Math.max(1e-9, maxDv - minDv) +
            (item.etaSeconds - minTime) / Math.max(1e-9, maxTime - minTime),
          bestScore =
            (best.estimatedDeltaVMps - minDv) / Math.max(1e-9, maxDv - minDv) +
            (best.etaSeconds - minTime) / Math.max(1e-9, maxTime - minTime);
        return score < bestScore ? item : best;
      });
    selected.push({ type: 'BALANCED', ...balanced });
  }
  selected.push({ type: 'FAST', ...fast });
  return selected;
}

export function generateManeuverPlan(ship: ShipState, requestedTarget: ManeuverTarget): ManeuverPlanResult {
  const categories: ManeuverCandidateType[] = ['ECONOMIC', 'BALANCED', 'FAST'];
  try {
    totalMassKg(ship.mass);
  } catch {
    return {
      version: 1,
      candidates: [],
      rejected: categories.map((type) => ({ type, reason: 'NO_FEASIBLE_TRANSFER' })),
    };
  }
  let target: ResolvedTarget;
  try {
    target = resolveTarget(ship, requestedTarget);
  } catch (error) {
    const reason = error instanceof PlannerFailure ? error.reason : 'INVALID_TARGET';
    return { version: 1, candidates: [], rejected: categories.map((type) => ({ type, reason })) };
  }
  const radius = length(ship.position),
    raw: RawCandidate[] = [],
    reasons: ManeuverRejectionReason[] = [];
  const directRangeM = length(sub(target.initialState.position, ship.position));
  if (requestedTarget.kind === 'NEAR_RENDEZVOUS_STATE' && directRangeM <= 100_000) {
    for (const seconds of [1_200, 900, 600]) {
      try {
        raw.push(runLocalRendezvous(ship, target, seconds));
      } catch (error) {
        reasons.push(error instanceof PlannerFailure ? error.reason : 'NO_FEASIBLE_TRANSFER');
      }
    }
  } else if (Math.abs(target.radiusM - radius) <= 1_000) {
    for (const revolutions of [1, 2, 3, 4, 5]) {
      try {
        raw.push(runPhasingTransfer(ship, target, revolutions));
      } catch (error) {
        reasons.push(error instanceof PlannerFailure ? error.reason : 'NO_FEASIBLE_TRANSFER');
      }
    }
  } else {
    const transferAxis = (radius + target.radiusM) / 2,
      transferSpeed = Math.sqrt(CONFIG.earthMu * (2 / radius - 1 / transferAxis)),
      currentProgradeSpeed = dot(ship.velocity, tangential(ship.position, target.normal, target.direction)),
      // A manual undock leaves a small, real velocity offset from the local
      // circular orbit. Base the departure burn on that authoritative velocity
      // instead of silently assuming the ship is already circularized.
      minimumDepartureDeltaV = Math.max(
        0.01,
        target.radiusM > radius
          ? transferSpeed - currentProgradeSpeed
          : currentProgradeSpeed - transferSpeed,
      );
    for (const factor of [1, 1.15, 1.35, 1.6, 1.9]) {
      try {
        raw.push(runRadialTransfer(ship, target, minimumDepartureDeltaV * factor));
      } catch (error) {
        reasons.push(error instanceof PlannerFailure ? error.reason : 'NO_FEASIBLE_TRANSFER');
      }
    }
  }
  const candidates = selectCandidates(raw),
    missing = categories.filter((type) => !candidates.some((candidate) => candidate.type === type)),
    reason = reasons.includes('INSUFFICIENT_DELTA_V')
      ? 'INSUFFICIENT_DELTA_V'
      : reasons.includes('INSUFFICIENT_PROPELLANT')
        ? 'INSUFFICIENT_PROPELLANT'
        : reasons.includes('ARRIVAL_TOLERANCE_NOT_MET')
          ? 'ARRIVAL_TOLERANCE_NOT_MET'
          : 'NO_FEASIBLE_TRANSFER';
  return { version: 1, candidates, rejected: missing.map((type) => ({ type, reason })) };
}
