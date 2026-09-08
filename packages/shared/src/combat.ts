import type { Vec3 } from './units';

export type CombatRegion = 'SAFE' | 'NORMAL' | 'CONTESTED';
export type MissileStatus = 'ACTIVE' | 'HIT' | 'EXPIRED' | 'DECOYED';
export type CombatModuleId = 'ENGINE' | 'FUEL' | 'POWER' | 'WEAPON';
export type BotCombatMode = 'PATROL' | 'ENGAGE' | 'ATTACK' | 'REPOSITION' | 'DESTROYED';
export type CombatEventType =
  | 'TARGET_SELECTED'
  | 'TARGET_CLEARED'
  | 'LASER_FIRED'
  | 'LASER_REJECTED'
  | 'LASER_HIT'
  | 'ENERGY_CHANGED'
  | 'HEAT_CHANGED'
  | 'MISSILE_LAUNCHED'
  | 'MISSILE_HIT'
  | 'MISSILE_EXPIRED'
  | 'COUNTERMEASURE_SUCCESS'
  | 'COUNTERMEASURE_FAILED'
  | 'DAMAGE_APPLIED'
  | 'MODULE_DAMAGED'
  | 'SHIP_DESTROYED'
  | 'WRECK_CREATED'
  | 'RECOVERY_COMPLETED'
  | 'COMBAT_PERMISSION_GRANTED';

export interface CombatModuleState {
  id: CombatModuleId;
  condition: number;
  consequence: string;
}

export interface BotCombatState {
  mode: BotCombatMode;
  laserEnergy: number;
  missileAmmunitionKg: number;
  laserCooldownUntilMs: number;
  missileCooldownUntilMs: number;
  nextDecisionAtMs: number;
}

export interface WreckState {
  id: string;
  shipId: string;
  definitionId: string;
  createdAtMs: number;
  cargoLostKg: number;
  ammunitionLostKg: number;
  upgradeIdsLost: string[];
}

export interface RecoveryState {
  status: 'PENDING' | 'CLAIMED';
  lostShipId: string;
  lostDefinitionId: string;
  covered: boolean;
  deductibleCredits: number;
  replacementShipId?: string;
  transactionId?: string;
  wreckId: string;
}

export interface CombatTargetState {
  id: string;
  label: string;
  position: Vec3;
  velocity: Vec3;
  radiusM: number;
  health: number;
  maxHealth: number;
  eligible: boolean;
  destroyed: boolean;
  occluded: boolean;
  rangeM: number;
  lineOfSight: boolean;
  engagementAllowed: boolean;
}

export interface MissileState {
  id: string;
  sourceId: string;
  targetId: string;
  position: Vec3;
  previousPosition: Vec3;
  velocity: Vec3;
  remainingPropulsionSeconds: number;
  remainingLifetimeSeconds: number;
  damage: number;
  status: MissileStatus;
}

export interface CombatEvent {
  id: string;
  type: CombatEventType;
  atMs: number;
  sourceId?: string;
  targetId?: string;
  value?: number;
  message: string;
}

export interface CombatState {
  region: CombatRegion;
  contacts: CombatTargetState[];
  selectedTargetId?: string;
  laserEnergy: number;
  laserHeat: number;
  laserCooldownUntilMs: number;
  missileCooldownUntilMs: number;
  countermeasureCharges: number;
  countermeasureCooldownUntilMs: number;
  playerHull: number;
  playerMaxHull: number;
  combatTagUntilMs: number;
  serverNowMs: number;
  missiles: MissileState[];
  events: CombatEvent[];
  processedCommandIds: string[];
  processedDamageIds: string[];
  sequence: number;
  scriptedIncomingLaunched: boolean;
  playerDestroyed: boolean;
  modules: Record<CombatModuleId, CombatModuleState>;
  bot: BotCombatState;
  wrecks: WreckState[];
  recovery?: RecoveryState;
}

export type CombatAction =
  | 'TARGET'
  | 'CLEAR_TARGET'
  | 'LASER'
  | 'MISSILE'
  | 'COUNTERMEASURE'
  | 'RECOVERY';

export const COMBAT_TARGET_ID = 'relay-contact-r17';
