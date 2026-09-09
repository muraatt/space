import type { ManeuverTarget } from './maneuver';

export type FactionId = 'AURORA' | 'VANGUARD';

export interface FactionDefinition {
  id: FactionId;
  name: string;
  symbol: string;
  motto: string;
  homeLocationId: string;
  homeLocationName: string;
}

export const FACTIONS: readonly FactionDefinition[] = Object.freeze([
  {
    id: 'AURORA',
    name: 'Aurora Sivil Ağı',
    symbol: '△',
    motto: 'Bilgi, emniyet, erişim',
    homeLocationId: 'aurora-anchor-400',
    homeLocationName: 'Aurora Ankrajı · 400 km',
  },
  {
    id: 'VANGUARD',
    name: 'Vanguard Yörünge Birliği',
    symbol: '◇',
    motto: 'Hazırlık, disiplin, süreklilik',
    homeLocationId: 'vanguard-anchor-400',
    homeLocationName: 'Vanguard İskelesi · 400 km',
  },
]);

export type MissionType = 'CARGO' | 'RECONNAISSANCE' | 'INTERCEPT' | 'BOUNTY';
export type MissionStatus = 'AVAILABLE' | 'ACCEPTED' | 'ACTIVE' | 'COMPLETED' | 'FAILED';

export interface MissionDestination {
  id: string;
  name: string;
  altitudeKm: number;
  toleranceM: number;
  target: ManeuverTarget;
}

export interface MissionReward {
  credits: number;
  reputation: number;
}

export interface MissionCargo {
  id: string;
  name: string;
  massKg: number;
  delivered: boolean;
}

export interface ReconObjective {
  requiredSeconds: number;
  progressSeconds: number;
  scanning: boolean;
}

export interface InterceptObjective {
  targetId: string;
  targetLabel: string;
  identified: boolean;
  combatAuthorized: boolean;
  damageRequired: number;
  damageDealt: number;
  neutralized: boolean;
}

export type BountyTargetClass = 'SCOUT' | 'FIGHTER' | 'HEAVY';
export type BountyThreat = 'LOW' | 'MEDIUM' | 'HIGH';

export interface BountyObjective {
  targetId: string;
  targetLabel: string;
  targetClass: BountyTargetClass;
  threat: BountyThreat;
  acquired: boolean;
  neutralized: boolean;
  rewardIssued: boolean;
  estimatedDeltaVMps: number;
  estimatedPropellantKg: number;
  acceptedFuelKg?: number;
  acceptedAmmunitionKg?: number;
  acceptedConditionPercent?: number;
  fuelUsedKg?: number;
  ammunitionUsedKg?: number;
  damagePercent?: number;
  operationalCostCredits?: number;
  netCredits?: number;
}

export interface MissionInstance {
  id: string;
  templateId?: string;
  type: MissionType;
  title: string;
  briefing: string;
  factionId: FactionId;
  status: MissionStatus;
  destination: MissionDestination;
  reward: MissionReward;
  estimatedEtaSeconds: number;
  difficulty: 'BAŞLANGIÇ' | 'STANDART';
  reachable: boolean;
  unavailableReason?: string;
  cargo?: MissionCargo;
  recon?: ReconObjective;
  intercept?: InterceptObjective;
  bounty?: BountyObjective;
  acceptedAtMs?: number;
  completedAtMs?: number;
  failedAtMs?: number;
}

export interface LocalPlayerProfile {
  playerId: string;
  factionId?: FactionId;
  credits: number;
  reputation: number;
  ownedShipIds: string[];
  activeShipId: string;
  activeMissionId?: string;
}

export type MissionAction = 'FACTION' | 'REFRESH' | 'ACCEPT' | 'DELIVER' | 'SCAN' | 'IDENTIFY' | 'ABANDON';
