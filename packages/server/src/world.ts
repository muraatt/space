import {
  CONFIG,
  neutralControls,
  type ManeuverCandidate,
  type ManeuverExecutionState,
  type SceneId,
  type ServerMetrics,
  type Vec3,
} from '@orbital/shared';
import {
  availableDeltaV,
  cross,
  initialWorld,
  length,
  normalize,
  orientationForBodyMinusZ,
  propagateKepler,
  scale,
  step,
  sub,
  totalMassKg,
} from '@orbital/simulation';
import { MemoryRepository } from './persistence/memory-repository';
export class World {
  state = initialWorld();
  paused = false;
  lastInputAt = 0;
  rejectedCommands = 0;
  private times: number[] = [];
  private repository = new MemoryRepository();
  reset(scene: SceneId, paused = false, seed = 4401) {
    this.state = initialWorld(scene, seed);
    this.paused = paused;
    this.lastInputAt = 0;
    this.repository.write(this.state);
  }
  startManeuver(planId: string, candidate: ManeuverCandidate, nowMs: number) {
    if (
      this.state.maneuver &&
      ['PLANNED', 'EXECUTING_BURN', 'COASTING', 'ARRIVAL_BURN'].includes(this.state.maneuver.status)
    )
      return { ok: false as const, code: 'MANEUVER_ACTIVE' };
    if (candidate.estimatedDeltaVMps > availableDeltaV(this.state.ship.mass) + 1e-6)
      return { ok: false as const, code: 'INSUFFICIENT_DELTA_V' };
    const firstBurn = candidate.burns[0];
    if (!firstBurn) return { ok: false as const, code: 'INVALID_PLAN' };
    const executionId = `${planId}:${candidate.type}`,
      waiting = firstBurn.offsetSeconds > 0.05,
      maneuver: ManeuverExecutionState = {
        executionId,
        planId,
        candidate,
        status: waiting ? 'COASTING' : 'EXECUTING_BURN',
        startedAtMs: nowMs,
        updatedAtMs: nowMs,
        nextEventAtMs: waiting ? nowMs + firstBurn.offsetSeconds * 1000 : undefined,
        activeBurnIndex: waiting ? undefined : 0,
        burnElapsedSeconds: 0,
        coastAnchor: waiting
          ? {
              atMs: nowMs,
              state: { position: [...this.state.ship.position], velocity: [...this.state.ship.velocity] },
              mass: { ...this.state.ship.mass },
            }
          : undefined,
      };
    this.state.controls = neutralControls();
    this.state.maneuver = maneuver;
    return { ok: true as const, executionId };
  }
  cancelManeuver(executionId: string, nowMs: number) {
    const maneuver = this.state.maneuver;
    if (!maneuver || maneuver.executionId !== executionId)
      return { ok: false as const, code: 'UNKNOWN_EXECUTION' };
    if (!['PLANNED', 'EXECUTING_BURN', 'COASTING', 'ARRIVAL_BURN'].includes(maneuver.status))
      return { ok: false as const, code: 'MANEUVER_NOT_ACTIVE' };
    if (maneuver.status === 'COASTING') this.advanceCoast(nowMs);
    this.state.controls = neutralControls();
    maneuver.status = 'CANCELLED';
    maneuver.updatedAtMs = nowMs;
    maneuver.completedAtMs = nowMs;
    maneuver.nextEventAtMs = undefined;
    maneuver.coastAnchor = undefined;
    return { ok: true as const, executionId };
  }
  private advanceCoast(nowMs: number) {
    const maneuver = this.state.maneuver,
      anchor = maneuver?.coastAnchor;
    if (!maneuver || !anchor) return;
    const sampleAt = Math.min(nowMs, maneuver.nextEventAtMs ?? nowMs),
      propagated = propagateKepler(anchor.state, Math.max(0, (sampleAt - anchor.atMs) / 1000));
    this.state.ship.position = propagated.position;
    this.state.ship.velocity = propagated.velocity;
    this.state.ship.mass = { ...anchor.mass };
    this.state.ship.massKg = totalMassKg(anchor.mass);
    maneuver.updatedAtMs = sampleAt;
  }
  private beginBurn(index: number, nowMs: number) {
    const maneuver = this.state.maneuver;
    if (!maneuver) return;
    maneuver.activeBurnIndex = index;
    maneuver.burnElapsedSeconds = 0;
    maneuver.status = index === 0 ? 'EXECUTING_BURN' : 'ARRIVAL_BURN';
    maneuver.updatedAtMs = nowMs;
    maneuver.nextEventAtMs = undefined;
    maneuver.coastAnchor = undefined;
  }
  private burnDirection(candidate: ManeuverCandidate, burnIndex: number): Vec3 {
    const burn = candidate.burns[burnIndex],
      ship = this.state.ship,
      normal = normalize(cross(ship.position, ship.velocity)),
      prograde = normalize(cross(normal, ship.position));
    if (burn.steering === 'PROGRADE') return prograde;
    if (burn.steering === 'RETROGRADE') return scale(prograde, -1);
    const targetRadius = length(candidate.expectedFinalState.position),
      desired = scale(prograde, Math.sqrt(CONFIG.earthMu / targetRadius));
    return normalize(sub(desired, ship.velocity));
  }
  private advanceManeuver(nowMs: number) {
    const maneuver = this.state.maneuver;
    if (!maneuver) return false;
    if (maneuver.status === 'COASTING') {
      this.advanceCoast(nowMs);
      if (nowMs >= (maneuver.nextEventAtMs ?? Infinity)) {
        const nextIndex = maneuver.activeBurnIndex === 0 ? 1 : 0;
        this.beginBurn(nextIndex, nowMs);
      }
      return true;
    }
    if (!['EXECUTING_BURN', 'ARRIVAL_BURN'].includes(maneuver.status)) return false;
    const burnIndex = maneuver.activeBurnIndex ?? 0,
      burn = maneuver.candidate.burns[burnIndex];
    if (!burn) {
      maneuver.status = 'FAILED';
      maneuver.failureReason = 'MISSING_BURN';
      maneuver.completedAtMs = nowMs;
      return true;
    }
    this.state.ship.orientation = orientationForBodyMinusZ(this.burnDirection(maneuver.candidate, burnIndex));
    this.state.ship.angularVelocity = [0, 0, 0];
    this.state.controls = { translation: [0, 0, -1], rotation: [0, 0, 0] };
    this.state = step(this.state);
    const active = this.state.maneuver!;
    active.burnElapsedSeconds += CONFIG.fixedDt;
    active.updatedAtMs = nowMs;
    if (active.burnElapsedSeconds + 1e-9 < burn.durationSeconds) return true;
    this.state.controls = neutralControls();
    if (burnIndex + 1 < active.candidate.burns.length) {
      active.status = 'COASTING';
      active.activeBurnIndex = burnIndex;
      active.burnElapsedSeconds = 0;
      active.coastAnchor = {
        atMs: nowMs,
        state: { position: [...this.state.ship.position], velocity: [...this.state.ship.velocity] },
        mass: { ...this.state.ship.mass },
      };
      active.nextEventAtMs = active.startedAtMs + active.candidate.burns[burnIndex + 1].offsetSeconds * 1000;
    } else {
      active.status = 'COMPLETE';
      active.completedAtMs = nowMs;
      active.nextEventAtMs = undefined;
      active.coastAnchor = undefined;
    }
    return true;
  }
  tick(now: number, nowMs = Date.now()) {
    if (this.paused) return;
    const start = performance.now();
    if (!this.advanceManeuver(nowMs)) {
      if (now - this.lastInputAt > CONFIG.inputTimeoutMs) this.state.controls = neutralControls();
      this.state = step(this.state);
    }
    this.times.push(performance.now() - start);
    if (this.times.length > 3600) this.times.shift();
    if (this.state.tick % 60 === 0) this.repository.write(this.state);
  }
  metrics(backlogMs = 0): ServerMetrics {
    const a = [...this.times].sort((x, y) => x - y),
      p = (n: number) => a[Math.min(a.length - 1, Math.floor(a.length * n))] ?? 0;
    return {
      tickMs: this.times.at(-1) ?? 0,
      tickP95Ms: p(0.95),
      tickP99Ms: p(0.99),
      backlogMs,
      rejectedCommands: this.rejectedCommands,
    };
  }
}
