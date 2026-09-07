import type { MassState } from './state';
import type { Vec3 } from './units';

export type ManeuverCandidateType = 'ECONOMIC' | 'BALANCED' | 'FAST';
export type ManeuverRejectionReason =
  | 'INSUFFICIENT_PROPELLANT'
  | 'INSUFFICIENT_DELTA_V'
  | 'INVALID_TARGET'
  | 'NO_FEASIBLE_TRANSFER'
  | 'ARRIVAL_TOLERANCE_NOT_MET';

export interface ManeuverOrbitalState {
  position: Vec3;
  velocity: Vec3;
}

/** phaseAheadRad is measured from the ship radius vector in its direction of travel at the planning epoch. */
export type ManeuverTarget =
  | { kind: 'CIRCULAR_ORBIT'; radiusM: number; phaseAheadRad: number }
  | { kind: 'NEAR_RENDEZVOUS_STATE'; state: ManeuverOrbitalState };

export interface PlannedBurn {
  offsetSeconds: number;
  durationSeconds: number;
  deltaVMps: number;
  steering: 'PROGRADE' | 'RETROGRADE' | 'MATCH_TARGET_VELOCITY';
}

export interface ManeuverCandidate {
  type: ManeuverCandidateType;
  estimatedDeltaVMps: number;
  estimatedPropellantKg: number;
  waitSeconds: number;
  transferDurationSeconds: number;
  etaSeconds: number;
  burns: PlannedBurn[];
  expectedFinalState: ManeuverOrbitalState;
  expectedFinalMass: MassState;
  expectedReserveDeltaVMps: number;
  verification: {
    positionErrorM: number;
    radiusErrorM: number;
    velocityErrorMps: number;
  };
}

export interface ManeuverPlanResult {
  version: 1;
  candidates: ManeuverCandidate[];
  rejected: Array<{ type: ManeuverCandidateType; reason: ManeuverRejectionReason }>;
}

export type ManeuverExecutionStatus =
  'IDLE' | 'PLANNED' | 'EXECUTING_BURN' | 'COASTING' | 'ARRIVAL_BURN' | 'COMPLETE' | 'CANCELLED' | 'FAILED';

export interface ManeuverExecutionState {
  executionId: string;
  planId: string;
  candidate: ManeuverCandidate;
  status: ManeuverExecutionStatus;
  startedAtMs: number;
  updatedAtMs: number;
  nextEventAtMs?: number;
  activeBurnIndex?: number;
  burnElapsedSeconds: number;
  coastAnchor?: {
    atMs: number;
    state: ManeuverOrbitalState;
    mass: MassState;
  };
  completedAtMs?: number;
  failureReason?: string;
}
