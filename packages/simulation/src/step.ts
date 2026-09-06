import { CONFIG, neutralControls, type WorldState, type SceneId, type Vec3 } from '@orbital/shared';
import { integrate } from './integrate';
import { length, multiplyQuat, normalizedQuat, rotate } from './coordinates';
export function initialWorld(scene: SceneId = 'orbit_day', seed = 4401): WorldState {
  const r = CONFIG.earthRadius + CONFIG.initialAltitude;
  return {
    universeId: CONFIG.universeId,
    scene,
    seed,
    tick: 0,
    lastInputSeq: -1,
    controls: neutralControls(),
    ship: {
      id: CONFIG.shipId,
      position: [r, 0, 0],
      velocity: [0, 0, -Math.sqrt(CONFIG.earthMu / r)],
      orientation: [0, 0, -Math.SQRT1_2, Math.SQRT1_2],
      angularVelocity: [0, 0, 0],
      massKg: CONFIG.massKg,
    },
  };
}
export function step(world: WorldState): WorldState {
  const dt = CONFIG.fixedDt,
    ship = world.ship;
  const angularVelocity = ship.angularVelocity.map((v, i) => {
    const target = world.controls.rotation[i] * CONFIG.angularRate,
      limit = CONFIG.angularAcceleration * dt;
    return v + Math.max(-limit, Math.min(limit, target - v));
  }) as Vec3;
  const w = length(angularVelocity),
    a = (w * dt) / 2;
  const delta =
    w > 0
      ? ([...angularVelocity.map((x) => (x * Math.sin(a)) / w), Math.cos(a)] as [
          number,
          number,
          number,
          number,
        ])
      : ([0, 0, 0, 1] as [number, number, number, number]);
  const orientation = normalizedQuat(multiplyQuat(ship.orientation, delta));
  const input = world.controls.translation;
  const thrust = rotate(
    [
      (input[0] * CONFIG.translationThrustN) / ship.massKg,
      (input[1] * CONFIG.translationThrustN) / ship.massKg,
      (input[2] * CONFIG.mainThrustN) / ship.massKg,
    ],
    orientation,
  );
  const motion = integrate(ship.position, ship.velocity, thrust, dt);
  return { ...world, tick: world.tick + 1, ship: { ...ship, ...motion, orientation, angularVelocity } };
}
