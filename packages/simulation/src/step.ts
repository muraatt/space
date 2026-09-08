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
  STATION_ID,
  STATION_PORT_ID,
  type StationState,
} from '@orbital/shared';
import { integrate } from './integrate';
import { add, length, multiplyQuat, normalizedQuat, rotate, scale } from './coordinates';
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
  const stationRadius = CONFIG.earthRadius + CONFIG.stationAltitudeM,
    stationPhase = scene === 'station_rendezvous' || scene === 'station_docking' || scene === 'bounty_sandbox'
      ? 0 : CONFIG.stationInitialPhaseRad,
    stationSpeed = Math.sqrt(CONFIG.earthMu / stationRadius),
    station: StationState = {
      id: STATION_ID,
      name: 'AEGIS SERVİS İSTASYONU',
      position: [stationRadius * Math.cos(stationPhase), 0, -stationRadius * Math.sin(stationPhase)],
      velocity: [-stationSpeed * Math.sin(stationPhase), 0, -stationSpeed * Math.cos(stationPhase)],
      orientation: [0, 0, 0, 1],
      angularVelocity: [0, 0, 0],
      bodyRadiusM: CONFIG.stationBodyRadiusM,
      orbitAltitudeM: CONFIG.stationAltitudeM,
      services: ['FUEL', 'REPAIR', 'AMMUNITION', 'HANGAR', 'CONTRACTS'],
      ports: [{
        id: STATION_PORT_ID,
        name: 'ALPHA SERVİS PORTU',
        capturePointLocal: [0, 0, CONFIG.stationPortCapturePointM],
        approachAxisLocal: [0, 0, 1],
        upAxisLocal: [0, 1, 0],
        captureRadiusM: CONFIG.stationCaptureRadiusM,
        maxRelativeSpeedMps: CONFIG.stationMaxDockingRelativeSpeedMps,
        maxClosingSpeedMps: CONFIG.stationMaxDockingClosingSpeedMps,
        maxLateralErrorM: CONFIG.stationMaxDockingLateralErrorM,
        maxAlignmentErrorDeg: CONFIG.stationMaxDockingAlignmentErrorDeg,
        maxRollErrorDeg: CONFIG.stationMaxDockingRollErrorDeg,
      }],
    },
    kestrel = makeShip('KESTREL_LOGISTICS', CONFIG.shipId),
    raptor = makeShip('RAPTOR_COMBAT', 'raptor-01'),
    activeShip = scene === 'intercept' || scene === 'missile_hit' || scene === 'bounty_sandbox' ? raptor : kestrel,
    bountyContacts = ([
      ['bounty-target-scout-01', 'ROGUE S-09', 'SCOUT', 'LOW', 460_000, 0.003, 65, 9],
      ['bounty-target-fighter-01', 'ROGUE F-17', 'FIGHTER', 'MEDIUM', 480_000, 0.016, 110, 13],
      ['bounty-target-heavy-01', 'ROGUE H-31', 'HEAVY', 'HIGH', 520_000, 0.026, 180, 18],
    ] as const).map(([id, label, bountyClass, threat, altitudeM, phase, health, radiusM]) => {
      const targetRadius = CONFIG.earthRadius + altitudeM,
        targetSpeed = Math.sqrt(CONFIG.earthMu / targetRadius),
        position: Vec3 = [targetRadius * Math.cos(phase), 0, -targetRadius * Math.sin(phase)],
        targetVelocity: Vec3 = [-targetSpeed * Math.sin(phase), 0, -targetSpeed * Math.cos(phase)];
      return {
        id, label, position, velocity: targetVelocity, radiusM, health, maxHealth: health,
        eligible: false, destroyed: false, occluded: false,
        rangeM: length(add(position, scale(activeShip.position, -1))),
        lineOfSight: true, engagementAllowed: false, bountyClass, threat, orbitAltitudeM: altitudeM,
      };
    }),
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
        ...bountyContacts,
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
  if (scene === 'station_rendezvous' || scene === 'station_docking' || scene === 'bounty_sandbox') {
    const portZ = CONFIG.stationPortCapturePointM,
      separation = scene === 'bounty_sandbox' ? 0.5 : scene === 'station_docking' ? 8 : 4_000;
    for (const ship of [kestrel, raptor]) {
      ship.position = [station.position[0], station.position[1], station.position[2] + portZ + separation];
      ship.velocity = [...station.velocity];
      ship.orientation = [0, 0, 0, 1];
      ship.angularVelocity = [0, 0, 0];
    }
  }
  return {
    universeId: CONFIG.universeId,
    scene,
    seed,
    tick: 0,
    lastInputSeq: -1,
    controls: neutralControls(),
    profile: {
      playerId: 'local-pilot-01',
      factionId: scene === 'bounty_sandbox' ? 'AURORA' : undefined,
      credits: CONFIG.startingCredits,
      reputation: 0,
      ownedShipIds: [CONFIG.shipId, 'raptor-01'],
      activeShipId: activeShip.id,
    },
    missions: [],
    ship: structuredClone(activeShip),
    remotePlayers: [],
    hangar: { ships: [kestrel, raptor], processedTransactionIds: [] },
    combat,
    station,
    docking: {
      phase: scene === 'bounty_sandbox' ? 'DOCKED' : 'NONE',
      selectedStationId: scene === 'bounty_sandbox' ? STATION_ID : undefined,
      portId: scene === 'bounty_sandbox' ? STATION_PORT_ID : undefined,
      guidance: scene === 'bounty_sandbox' ? 'CAPTURED' : 'SELECT_STATION',
      processedCommandIds: [],
      impactCooldownUntilMs: 0,
      rendezvousComplete: scene === 'station_docking' || scene === 'bounty_sandbox',
      stationUpdatedAtMs: 0,
    },
  };
}
export function step(world: WorldState): WorldState {
  const dt = CONFIG.fixedDt,
    ship = world.ship,
    stationMotion = integrate(world.station.position, world.station.velocity, [0, 0, 0], dt),
    station = { ...world.station, ...stationMotion };
  const authoritativeMassKg = totalMassKg(ship.mass);
  if (!Number.isFinite(ship.massKg) || Math.abs(ship.massKg - authoritativeMassKg) > 1e-9)
    throw new RangeError('Ship total mass is inconsistent with its mass components');
  if (world.docking.phase === 'DOCKED') {
    const port = station.ports.find(item => item.id === world.docking.portId) ?? station.ports[0],
      capture = add(station.position, rotate(port.capturePointLocal, station.orientation)),
      position = add(capture, scale(rotate(port.approachAxisLocal, station.orientation), 0.5));
    return {
      ...world,
      tick: world.tick + 1,
      station,
      controls: neutralControls(),
      ship: { ...ship, position, velocity: [...station.velocity], orientation: [0, 0, 0, 1], angularVelocity: [0, 0, 0] },
    };
  }
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
    station,
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
