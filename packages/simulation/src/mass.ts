import { CONFIG, type MassState } from '@orbital/shared';

const parts = (mass: MassState) => [
  mass.dryKg,
  mass.modulesKg,
  mass.cargoKg,
  mass.ammunitionKg,
  mass.propellantKg,
];

export function assertValidMass(mass: MassState): void {
  if (parts(mass).some((value) => !Number.isFinite(value) || value < 0) || !(mass.dryKg > 0)) {
    throw new RangeError('Invalid spacecraft mass state');
  }
}

export function totalMassKg(mass: MassState): number {
  assertValidMass(mass);
  const total = parts(mass).reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(total) || total <= 0) throw new RangeError('Invalid total spacecraft mass');
  return total;
}

export function dryAndPayloadMassKg(mass: MassState): number {
  return totalMassKg({ ...mass, propellantKg: 0 });
}

export function availableDeltaV(
  mass: MassState,
  specificImpulseSeconds: number = CONFIG.specificImpulseSeconds,
): number {
  const wet = totalMassKg(mass);
  const dry = dryAndPayloadMassKg(mass);
  if (!Number.isFinite(specificImpulseSeconds) || specificImpulseSeconds <= 0)
    throw new RangeError('Specific impulse must be finite and positive');
  if (mass.propellantKg === 0) return 0;
  return specificImpulseSeconds * CONFIG.standardGravity * Math.log(wet / dry);
}

export function propellantForForce(
  forceNewtons: number,
  durationSeconds: number,
  availableKg: number,
  specificImpulseSeconds: number = CONFIG.specificImpulseSeconds,
) {
  if (
    !Number.isFinite(forceNewtons) ||
    !Number.isFinite(durationSeconds) ||
    !Number.isFinite(availableKg) ||
    !Number.isFinite(specificImpulseSeconds) ||
    forceNewtons < 0 ||
    durationSeconds < 0 ||
    availableKg < 0 ||
    specificImpulseSeconds <= 0
  )
    throw new RangeError('Invalid propulsion input');
  const requestedKg = (forceNewtons * durationSeconds) / (specificImpulseSeconds * CONFIG.standardGravity);
  const consumedKg = Math.min(availableKg, requestedKg);
  return { consumedKg, thrustFraction: requestedKg > 0 ? consumedKg / requestedKg : 0 };
}
