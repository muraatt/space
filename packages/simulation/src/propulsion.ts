import { CONFIG, type Controls, type MassState, type ShipPerformance, type Vec3 } from '@orbital/shared';
import { length, scale } from './coordinates';
import { propellantForForce, totalMassKg } from './mass';

export function propulsionStep(
  mass: MassState,
  controls: Controls,
  durationSeconds = CONFIG.fixedDt,
  performance?: Pick<ShipPerformance, 'mainThrustN' | 'translationThrustN' | 'specificImpulseSeconds'>,
) {
  const mainThrustN = performance?.mainThrustN ?? CONFIG.mainThrustN,
    translationThrustN = performance?.translationThrustN ?? CONFIG.translationThrustN,
    specificImpulseSeconds = performance?.specificImpulseSeconds ?? CONFIG.specificImpulseSeconds;
  const requestedForce: Vec3 = [
    controls.translation[0] * translationThrustN,
    controls.translation[1] * translationThrustN,
    controls.translation[2] * mainThrustN,
  ];
  const requestedMagnitude = length(requestedForce);
  const use = propellantForForce(
    requestedMagnitude,
    durationSeconds,
    mass.propellantKg,
    specificImpulseSeconds,
  );
  const nextMass: MassState = { ...mass, propellantKg: mass.propellantKg - use.consumedKg };
  if (nextMass.propellantKg < 1e-12) nextMass.propellantKg = 0;
  const meanMassKg = totalMassKg(mass) - use.consumedKg / 2;
  return {
    bodyAcceleration: scale(requestedForce, use.thrustFraction / meanMassKg),
    consumedPropellantKg: use.consumedKg,
    mass: nextMass,
    massKg: totalMassKg(nextMass),
    thrustFraction: use.thrustFraction,
  };
}
