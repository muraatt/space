import {
  CONFIG,
  COMBAT_TARGET_ID,
  neutralControls,
  shipDefinition,
  shipPerformance,
  type ShipDefinitionId,
  type ShipState,
  type WorldState,
  type SceneId,
  type Vec3,
  type CombatState,
} from '@orbital/shared';
import { integrate } from './integrate';
import { length, multiplyQuat, normalizedQuat, rotate } from './coordinates';
import { propulsionStep } from './propulsion';
import { totalMassKg } from './mass';
export function initialWorld(scene: SceneId = 'orbit_day', seed = 4401): WorldState {
  const initialAltitude = scene === 'cargo_mission' ? 450_000 : CONFIG.initialAltitude,
    r = CONFIG.earthRadius + initialAltitude,
    velocity: Vec3 = [0, 0, -Math.sqrt(CONFIG.earthMu / r)];
  const makeShip = (definitionId: ShipDefinitionId, id: string): ShipState => {
    const definition = shipDefinition(definitionId),
      performance = shipPerformance(definitionId, []),
      propellantKg =
        definitionId === 'KESTREL_LOGISTICS' && scene === 'low_fuel'
          ? CONFIG.lowFuelPropellantKg
          : definition.initialPropellantKg,
      mass = {
        dryKg: performance.dryMassKg,
        modulesKg: 0,
        cargoKg: 0,
        ammunitionKg: definition.initialAmmunitionKg,
        propellantKg,
      };
    return {
      id,
      definitionId,
      position: [r, 0, 0],
      velocity: [...velocity],
      orientation: [0, 0, -Math.SQRT1_2, Math.SQRT1_2],
      angularVelocity: [0, 0, 0],
      massKg: totalMassKg(mass),
      mass,
      performance,
      conditionPercent: definition.initialConditionPercent,
      installedUpgradeIds: [],
    };
  };
  const kestrel = makeShip('KESTREL_LOGISTICS', CONFIG.shipId),
    raptor = makeShip('RAPTOR_COMBAT', 'raptor-01'),
    activeShip = scene === 'intercept' || scene === 'missile_hit' ? raptor : kestrel,
    combat: CombatState = {
      region:
        scene === 'orbit_night' || scene === 'missile_hit'
          ? 'CONTESTED'
          : scene === 'intercept'
            ? 'NORMAL'
            : 'SAFE',
      contacts: [
        {
          id: COMBAT_TARGET_ID,
          label: 'Kimliksiz Röle R-17',
          position: [r, 0, scene === 'missile_hit' ? -350 : -1200],
          velocity: [...velocity],
          radiusM: 16,
          health: 100,
          maxHealth: 100,
          eligible: scene === 'orbit_night' || scene === 'missile_hit',
          destroyed: false,
          occluded: false,
          rangeM: scene === 'missile_hit' ? 350 : 1200,
          lineOfSight: true,
          engagementAllowed: scene === 'orbit_night' || scene === 'missile_hit',
        },
      ],
      laserEnergy: 100,
      laserHeat: 0,
      laserCooldownUntilMs: 0,
      missileCooldownUntilMs: 0,
      countermeasureCharges: CONFIG.countermeasureCharges,
      countermeasureCooldownUntilMs: 0,
      playerHull: 100,
      playerMaxHull: 100,
      combatTagUntilMs: 0,
      serverNowMs: CONFIG.epochMs,
      missiles: [],
      events: [],
      processedCommandIds: [],
      processedDamageIds: [],
      sequence: 0,
      scriptedIncomingLaunched: false,
      playerDestroyed: false,
      modules: {
        ENGINE: { id: 'ENGINE', condition: 100, consequence: 'İtki nominal' },
        FUEL: { id: 'FUEL', condition: 100, consequence: 'Yakıt sistemi nominal' },
        POWER: { id: 'POWER', condition: 100, consequence: 'Enerji dolumu nominal' },
        WEAPON: { id: 'WEAPON', condition: 100, consequence: 'Silahlar nominal' },
      },
      bot: {
        mode: scene === 'missile_hit' ? 'ATTACK' : 'PATROL',
        laserEnergy: 100,
        missileAmmunitionKg: CONFIG.botInitialMissileAmmunitionKg,
        laserCooldownUntilMs: 0,
        missileCooldownUntilMs: 0,
        nextDecisionAtMs: CONFIG.epochMs,
      },
      wrecks: [],
    };
  return {
    universeId: CONFIG.universeId,
    scene,
    seed,
    tick: 0,
    lastInputSeq: -1,
    controls: neutralControls(),
    profile: {
      playerId: 'local-pilot-01',
      credits: CONFIG.startingCredits,
      reputation: 0,
      ownedShipIds: [CONFIG.shipId, 'raptor-01'],
      activeShipId: activeShip.id,
    },
    missions: [],
    ship: structuredClone(activeShip),
    hangar: { ships: [kestrel, raptor], processedTransactionIds: [] },
    combat,
  };
}
export function step(world: WorldState): WorldState {
  const dt = CONFIG.fixedDt,
    ship = world.ship;
  const authoritativeMassKg = totalMassKg(ship.mass);
  if (!Number.isFinite(ship.massKg) || Math.abs(ship.massKg - authoritativeMassKg) > 1e-9)
    throw new RangeError('Ship total mass is inconsistent with its mass components');
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
  const propulsion = propulsionStep(ship.mass, world.controls, dt, ship.performance);
  const thrust = rotate(propulsion.bodyAcceleration, orientation);
  const motion = integrate(ship.position, ship.velocity, thrust, dt);
  return {
    ...world,
    tick: world.tick + 1,
    ship: {
      ...ship,
      ...motion,
      orientation,
      angularVelocity,
      mass: propulsion.mass,
      massKg: propulsion.massKg,
    },
  };
}
