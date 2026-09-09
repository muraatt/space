import {
  CONFIG,
  UPGRADE_DEFINITIONS,
  shipDefinition,
  shipPerformance,
  type ShipPerformance,
  type ShipState,
} from '@orbital/shared';
import { totalMassKg } from '@orbital/simulation';
import type { PilotCheckpoint } from './identity-repository';

export function assertPilotCheckpoint(value: unknown, ship: ShipState): asserts value is PilotCheckpoint {
  if (!value || typeof value !== 'object') throw new IdentityRestoreError('PERSISTED_CHECKPOINT_INVALID');
  const data = value as PilotCheckpoint;
  const strings = (items: unknown): items is string[] => Array.isArray(items) && items.every(item => typeof item === 'string' && item.length > 0);
  if (data.version !== 1 || !Number.isSafeInteger(data.credits) || data.credits < 0 ||
    !Number.isSafeInteger(data.reputation) || data.reputation < 0 ||
    (data.factionId !== undefined && !['AURORA', 'VANGUARD'].includes(data.factionId)) ||
    !strings(data.economicTransactionIds) || !strings(data.completedMissionTemplateIds) ||
    !Number.isFinite(data.missionCargoKg) || data.missionCargoKg < 0 || data.missionCargoKg > ship.mass.cargoKg ||
    !Array.isArray(data.wrecks) || !data.modules ||
    (['ENGINE', 'FUEL', 'POWER', 'WEAPON'] as const).some(id => !data.modules[id] || data.modules[id].id !== id ||
      !Number.isFinite(data.modules[id].condition) || data.modules[id].condition < 0 || data.modules[id].condition > 100))
    throw new IdentityRestoreError('PERSISTED_CHECKPOINT_INVALID');
  const recovery = data.recovery;
  if (recovery && (!['PENDING', 'CLAIMED'].includes(recovery.status) ||
    !Number.isSafeInteger(recovery.deductibleCredits) || recovery.deductibleCredits < 0 ||
    (recovery.recoverablePropellantKg !== undefined && (!Number.isFinite(recovery.recoverablePropellantKg) || recovery.recoverablePropellantKg < 0)) ||
    (recovery.status === 'PENDING' && (ship.conditionPercent > 0 || recovery.lostShipId !== ship.id || recovery.lostDefinitionId !== ship.definitionId)) ||
    (recovery.status === 'CLAIMED' && (ship.conditionPercent <= 0 || recovery.replacementShipId !== ship.id))))
    throw new IdentityRestoreError('PERSISTED_LIFECYCLE_INVALID');
}

export class IdentityRestoreError extends Error {
  constructor(message = 'PERSISTED_SHIP_INVALID') {
    super(message);
  }
}

const finiteTuple = (value: unknown, length: number) =>
  Array.isArray(value) && value.length === length && value.every(Number.isFinite);

const close = (left: number, right: number, tolerance = 1e-9) =>
  Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance;

function assertPerformance(actual: ShipPerformance, expected: ShipPerformance) {
  const fixedKeys = [
    'dryMassKg',
    'propellantCapacityKg',
    'cargoCapacityKg',
    'ammunitionCapacityKg',
    'specificImpulseSeconds',
    'durabilityRating',
    'sensorScanTimeMultiplier',
  ] as const;
  if (fixedKeys.some((key) => !close(actual[key], expected[key])))
    throw new IdentityRestoreError();
  if (
    !Number.isFinite(actual.mainThrustN) ||
    !Number.isFinite(actual.translationThrustN) ||
    actual.mainThrustN < expected.mainThrustN * 0.35 ||
    actual.mainThrustN > expected.mainThrustN ||
    actual.translationThrustN < expected.translationThrustN * 0.35 ||
    actual.translationThrustN > expected.translationThrustN ||
    !close(actual.mainThrustN / expected.mainThrustN, actual.translationThrustN / expected.translationThrustN)
  ) throw new IdentityRestoreError();
  if (
    !actual.slots ||
    (['PROPULSION', 'CARGO', 'SYSTEMS'] as const).some((slot) => actual.slots[slot] !== expected.slots[slot])
  ) throw new IdentityRestoreError();
}

/** Validate the persisted Phase-0 ship boundary before it reaches World.tick(). */
export function assertRestorableShip(value: unknown, expectedShipId: string): asserts value is ShipState {
  if (!value || typeof value !== 'object') throw new IdentityRestoreError();
  const ship = value as ShipState;
  if (
    ship.id !== expectedShipId ||
    !finiteTuple(ship.position, 3) ||
    !finiteTuple(ship.velocity, 3) ||
    !finiteTuple(ship.orientation, 4) ||
    !finiteTuple(ship.angularVelocity, 3) ||
    Math.hypot(...ship.position) <= CONFIG.earthRadius ||
    !close(Math.hypot(...ship.orientation), 1, 1e-6) ||
    !Number.isFinite(ship.conditionPercent) ||
    ship.conditionPercent < 0 ||
    ship.conditionPercent > 100 ||
    !Array.isArray(ship.installedUpgradeIds) ||
    ship.installedUpgradeIds.some((id) => typeof id !== 'string') ||
    new Set(ship.installedUpgradeIds).size !== ship.installedUpgradeIds.length ||
    !ship.mass ||
    !ship.performance
  ) throw new IdentityRestoreError();

  try {
    shipDefinition(ship.definitionId);
  } catch {
    throw new IdentityRestoreError();
  }
  const upgrades = ship.installedUpgradeIds.map((id) => UPGRADE_DEFINITIONS.find((item) => item.id === id));
  if (upgrades.some((upgrade) => !upgrade || !upgrade.compatibleShips.includes(ship.definitionId)))
    throw new IdentityRestoreError();
  const expectedPerformance = shipPerformance(ship.definitionId, ship.installedUpgradeIds),
    massValues = Object.values(ship.mass),
    expectedModulesKg = upgrades.reduce((sum, upgrade) => sum + (upgrade?.moduleMassKg ?? 0), 0);
  if (
    massValues.some((item) => !Number.isFinite(item) || item < 0) ||
    !close(ship.mass.dryKg, expectedPerformance.dryMassKg) ||
    !close(ship.mass.modulesKg, expectedModulesKg) ||
    ship.mass.cargoKg > expectedPerformance.cargoCapacityKg ||
    ship.mass.ammunitionKg > expectedPerformance.ammunitionCapacityKg ||
    ship.mass.propellantKg > expectedPerformance.propellantCapacityKg ||
    !close(ship.massKg, totalMassKg(ship.mass))
  ) throw new IdentityRestoreError();
  assertPerformance(ship.performance, expectedPerformance);
}
