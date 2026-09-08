import type { Quat, Vec3 } from './units';

export const STATION_ID = 'aegis-service-01';
export const STATION_PORT_ID = 'aegis-port-alpha';

export type StationService = 'FUEL' | 'REPAIR' | 'AMMUNITION' | 'HANGAR' | 'CONTRACTS';
export type DockingPhase = 'NONE' | 'RENDEZVOUS' | 'APPROACH' | 'FINAL_APPROACH' | 'DOCKED';
export type DockingGuidance =
  | 'SELECT_STATION'
  | 'RENDEZVOUS'
  | 'APPROACH'
  | 'ALIGN_POSITION'
  | 'ALIGN_ATTITUDE'
  | 'TOO_FAST'
  | 'READY'
  | 'CAPTURED'
  | 'UNDOCKED';

export interface DockingPortState {
  id: string;
  name: string;
  capturePointLocal: Vec3;
  approachAxisLocal: Vec3;
  upAxisLocal: Vec3;
  captureRadiusM: number;
  maxRelativeSpeedMps: number;
  maxClosingSpeedMps: number;
  maxLateralErrorM: number;
  maxAlignmentErrorDeg: number;
  maxRollErrorDeg: number;
}

export interface StationState {
  id: string;
  name: string;
  position: Vec3;
  velocity: Vec3;
  orientation: Quat;
  angularVelocity: Vec3;
  bodyRadiusM: number;
  orbitAltitudeM: number;
  services: StationService[];
  ports: DockingPortState[];
}

export interface DockingMetrics {
  rangeM: number;
  relativeSpeedMps: number;
  closingSpeedMps: number;
  axialDistanceM: number;
  lateralErrorM: number;
  verticalErrorM: number;
  forwardAlignment: number;
  yawErrorDeg: number;
  pitchErrorDeg: number;
  rollErrorDeg: number;
}

export interface DockingState {
  phase: DockingPhase;
  selectedStationId?: string;
  portId?: string;
  metrics?: DockingMetrics;
  guidance: DockingGuidance;
  lastResultCode?: string;
  processedCommandIds: string[];
  impactCooldownUntilMs: number;
  rendezvousComplete: boolean;
  stationUpdatedAtMs: number;
}

export type DockingAction = 'SELECT_STATION' | 'DOCK' | 'UNDOCK';
