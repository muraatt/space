import { CONFIG, type Controls, type MassState, type Vec3 } from '@orbital/shared';
import { length, scale } from './coordinates';
import { propellantForForce, totalMassKg } from './mass';

export function propulsionStep(mass: MassState, controls: Controls, durationSeconds = CONFIG.fixedDt) {
  const requestedForce: Vec3 = [
    controls.translation[0] * CONFIG.translationThrustN,
    controls.translation[1] * CONFIG.translationThrustN,
    controls.translation[2] * CONFIG.mainThrustN,
  ];
  const requestedMagnitude = length(requestedForce);
  const use = propellantForForce(requestedMagnitude, durationSeconds, mass.propellantKg);
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
