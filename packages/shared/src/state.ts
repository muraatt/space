import type { Quat, Vec3 } from './units';
import type { SceneId } from './config';
import type { ManeuverExecutionState, ManeuverPlanResult } from './maneuver';
import type { LocalPlayerProfile, MissionAction, MissionInstance } from './mission';
import type { ShipDefinitionId, ShipPerformance } from './hangar';
import type { CombatAction, CombatState } from './combat';
export interface Controls {
  translation: Vec3;
  rotation: Vec3;
}
export const neutralControls = (): Controls => ({ translation: [0, 0, 0], rotation: [0, 0, 0] });
export interface ShipState {
  id: string;
  definitionId: ShipDefinitionId;
  position: Vec3;
  velocity: Vec3;
  orientation: Quat;
  angularVelocity: Vec3;
  /** Derived from mass; retained in snapshots as a convenient authoritative total. */
  massKg: number;
  mass: MassState;
  performance: ShipPerformance;
  conditionPercent: number;
  installedUpgradeIds: string[];
}
export interface MassState {
  dryKg: number;
  modulesKg: number;
  cargoKg: number;
  ammunitionKg: number;
  propellantKg: number;
}
export interface WorldState {
  universeId: string;
  scene: SceneId;
  seed: number;
  tick: number;
  ship: ShipState;
  lastInputSeq: number;
  controls: Controls;
  maneuver?: ManeuverExecutionState;
  profile: LocalPlayerProfile;
  missions: MissionInstance[];
  hangar: {
    ships: ShipState[];
    processedTransactionIds: string[];
  };
  combat: CombatState;
}
export interface ServerMetrics {
  tickMs: number;
  tickP95Ms: number;
  tickP99Ms: number;
  backlogMs: number;
  rejectedCommands: number;
}
export interface Snapshot {
  type: 'snapshot';
  version: 1;
  state: WorldState;
  serverNowMs: number;
  metrics: ServerMetrics;
  paused: boolean;
}
export type ServerMessage =
  | Snapshot
  | { type: 'welcome'; version: 1; shipId: string; testMode: boolean }
  | { type: 'error'; code: string }
  | { type: 'maneuver_plan'; requestId: string; result: ManeuverPlanResult }
  | { type: 'maneuver_ack'; action: 'EXECUTE' | 'CANCEL'; executionId: string }
  | { type: 'mission_ack'; action: MissionAction; missionId?: string }
  | {
      type: 'economy_ack';
      action: 'SELECT_SHIP' | 'FUEL' | 'REPAIR' | 'AMMUNITION' | 'UPGRADE';
      transactionId: string;
      credits: number;
    }
  | { type: 'combat_ack'; action: CombatAction; commandId: string }
  | { type: 'pong'; sentAt: number };
