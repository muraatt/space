import type { Quat, Vec3 } from './units';
import type { SceneId } from './config';
import type { ManeuverExecutionState, ManeuverPlanResult } from './maneuver';
export interface Controls {
  translation: Vec3;
  rotation: Vec3;
}
export const neutralControls = (): Controls => ({ translation: [0, 0, 0], rotation: [0, 0, 0] });
export interface ShipState {
  id: string;
  position: Vec3;
  velocity: Vec3;
  orientation: Quat;
  angularVelocity: Vec3;
  /** Derived from mass; retained in snapshots as a convenient authoritative total. */
  massKg: number;
  mass: MassState;
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
  | { type: 'pong'; sentAt: number };
