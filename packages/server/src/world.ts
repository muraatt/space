import {
  CONFIG,
  UPGRADE_DEFINITIONS,
  neutralControls,
  shipPerformance,
  type ManeuverCandidate,
  type ManeuverExecutionState,
  type FactionId,
  type MissionInstance,
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
  private syncActiveShipRecord() {
    const index = this.state.hangar.ships.findIndex((ship) => ship.id === this.state.profile.activeShipId);
    if (index >= 0) this.state.hangar.ships[index] = structuredClone(this.state.ship);
  }
  private transactionAvailable(transactionId: string) {
    if (this.state.hangar.processedTransactionIds.includes(transactionId))
      return { ok: false as const, code: 'DUPLICATE_TRANSACTION' };
    return { ok: true as const };
  }
  private rememberTransaction(transactionId: string) {
    this.state.hangar.processedTransactionIds.push(transactionId);
    if (this.state.hangar.processedTransactionIds.length > 256)
      this.state.hangar.processedTransactionIds.shift();
  }
  private hangarAvailable() {
    if (this.state.profile.activeMissionId) return { ok: false as const, code: 'MISSION_ACTIVE' };
    if (
      this.state.maneuver &&
      ['PLANNED', 'EXECUTING_BURN', 'COASTING', 'ARRIVAL_BURN'].includes(this.state.maneuver.status)
    )
      return { ok: false as const, code: 'MANEUVER_ACTIVE' };
    const altitudeM = length(this.state.ship.position) - CONFIG.earthRadius;
    if (![400_000, 450_000, 800_000].some((value) => Math.abs(value - altitudeM) <= 25_000))
      return { ok: false as const, code: 'SERVICE_UNAVAILABLE' };
    return { ok: true as const };
  }
  private charge(cost: number) {
    if (!Number.isInteger(cost) || cost < 0) return { ok: false as const, code: 'INVALID_PRICE' };
    if (this.state.profile.credits < cost) return { ok: false as const, code: 'INSUFFICIENT_CREDITS' };
    this.state.profile.credits -= cost;
    return { ok: true as const };
  }
  selectShip(targetShipId: string, transactionId: string) {
    const unique = this.transactionAvailable(transactionId);
    if (!unique.ok) return unique;
    const allowed = this.hangarAvailable();
    if (!allowed.ok) return allowed;
    if (!this.state.profile.ownedShipIds.includes(targetShipId))
      return { ok: false as const, code: 'SHIP_NOT_OWNED' };
    if (targetShipId === this.state.profile.activeShipId)
      return { ok: false as const, code: 'SHIP_ALREADY_ACTIVE' };
    const target = this.state.hangar.ships.find((ship) => ship.id === targetShipId);
    if (!target) return { ok: false as const, code: 'UNKNOWN_SHIP' };
    const dockState = {
      position: [...this.state.ship.position] as Vec3,
      velocity: [...this.state.ship.velocity] as Vec3,
      orientation: [...this.state.ship.orientation] as [number, number, number, number],
    };
    this.syncActiveShipRecord();
    this.state.ship = structuredClone(target);
    this.state.ship.position = dockState.position;
    this.state.ship.velocity = dockState.velocity;
    this.state.ship.orientation = dockState.orientation;
    this.state.ship.angularVelocity = [0, 0, 0];
    this.state.profile.activeShipId = targetShipId;
    this.state.controls = neutralControls();
    this.state.maneuver = undefined;
    this.syncActiveShipRecord();
    this.rememberTransaction(transactionId);
    return { ok: true as const, cost: 0 };
  }
  buyFuel(amountKg: number, transactionId: string) {
    const unique = this.transactionAvailable(transactionId);
    if (!unique.ok) return unique;
    const allowed = this.hangarAvailable();
    if (!allowed.ok) return allowed;
    if (!Number.isFinite(amountKg) || amountKg <= 0) return { ok: false as const, code: 'INVALID_AMOUNT' };
    if (
      this.state.ship.mass.propellantKg + amountKg >
      this.state.ship.performance.propellantCapacityKg + 1e-9
    )
      return { ok: false as const, code: 'FUEL_OVERFILL' };
    const cost = Math.ceil(amountKg * CONFIG.fuelCreditsPerKg),
      charged = this.charge(cost);
    if (!charged.ok) return charged;
    this.state.ship.mass.propellantKg += amountKg;
    this.state.ship.massKg = totalMassKg(this.state.ship.mass);
    this.syncActiveShipRecord();
    this.rememberTransaction(transactionId);
    return { ok: true as const, cost };
  }
  repairShip(transactionId: string) {
    const unique = this.transactionAvailable(transactionId);
    if (!unique.ok) return unique;
    const allowed = this.hangarAvailable();
    if (!allowed.ok) return allowed;
    const missing = 100 - this.state.ship.conditionPercent;
    if (missing <= 1e-9) return { ok: false as const, code: 'NO_REPAIR_NEEDED' };
    const cost = Math.ceil(missing * CONFIG.repairCreditsPerPercent),
      charged = this.charge(cost);
    if (!charged.ok) return charged;
    this.state.ship.conditionPercent = 100;
    this.syncActiveShipRecord();
    this.rememberTransaction(transactionId);
    return { ok: true as const, cost };
  }
  buyAmmunition(amountKg: number, transactionId: string) {
    const unique = this.transactionAvailable(transactionId);
    if (!unique.ok) return unique;
    const allowed = this.hangarAvailable();
    if (!allowed.ok) return allowed;
    const capacity = this.state.ship.performance.ammunitionCapacityKg;
    if (capacity <= 0) return { ok: false as const, code: 'AMMUNITION_INCOMPATIBLE' };
    if (!Number.isFinite(amountKg) || amountKg <= 0) return { ok: false as const, code: 'INVALID_AMOUNT' };
    if (this.state.ship.mass.ammunitionKg + amountKg > capacity + 1e-9)
      return { ok: false as const, code: 'AMMUNITION_OVERFILL' };
    const cost = Math.ceil(amountKg * CONFIG.ammunitionCreditsPerKg),
      charged = this.charge(cost);
    if (!charged.ok) return charged;
    this.state.ship.mass.ammunitionKg += amountKg;
    this.state.ship.massKg = totalMassKg(this.state.ship.mass);
    this.syncActiveShipRecord();
    this.rememberTransaction(transactionId);
    return { ok: true as const, cost };
  }
  installUpgrade(upgradeId: string, transactionId: string) {
    const unique = this.transactionAvailable(transactionId);
    if (!unique.ok) return unique;
    const allowed = this.hangarAvailable();
    if (!allowed.ok) return allowed;
    const upgrade = UPGRADE_DEFINITIONS.find((item) => item.id === upgradeId);
    if (!upgrade) return { ok: false as const, code: 'UNKNOWN_UPGRADE' };
    if (this.state.ship.installedUpgradeIds.includes(upgradeId))
      return { ok: false as const, code: 'UPGRADE_ALREADY_INSTALLED' };
    if (!upgrade.compatibleShips.includes(this.state.ship.definitionId))
      return { ok: false as const, code: 'UPGRADE_INCOMPATIBLE' };
    const usedSlots = this.state.ship.installedUpgradeIds.filter(
      (id) => UPGRADE_DEFINITIONS.find((item) => item.id === id)?.slot === upgrade.slot,
    ).length;
    if (usedSlots >= this.state.ship.performance.slots[upgrade.slot])
      return { ok: false as const, code: 'UPGRADE_SLOT_FULL' };
    const charged = this.charge(upgrade.priceCredits);
    if (!charged.ok) return charged;
    this.state.ship.installedUpgradeIds.push(upgrade.id);
    this.state.ship.mass.modulesKg += upgrade.moduleMassKg;
    this.state.ship.performance = shipPerformance(
      this.state.ship.definitionId,
      this.state.ship.installedUpgradeIds,
    );
    this.state.ship.massKg = totalMassKg(this.state.ship.mass);
    this.syncActiveShipRecord();
    this.rememberTransaction(transactionId);
    return { ok: true as const, cost: upgrade.priceCredits };
  }
  chooseFaction(factionId: FactionId) {
    if (this.state.profile.factionId && this.state.profile.factionId !== factionId)
      return { ok: false as const, code: 'FACTION_LOCKED' };
    this.state.profile.factionId = factionId;
    return { ok: true as const };
  }
  setMissionOffers(missions: MissionInstance[]) {
    if (!this.state.profile.factionId) return { ok: false as const, code: 'FACTION_REQUIRED' };
    if (this.state.profile.activeMissionId) return { ok: false as const, code: 'MISSION_ACTIVE' };
    const historical = this.state.missions.filter((mission) =>
      ['COMPLETED', 'FAILED'].includes(mission.status),
    );
    this.state.missions = [
      ...historical,
      ...missions.filter((offer) => !historical.some((mission) => mission.id === offer.id)),
    ];
    return { ok: true as const };
  }
  acceptMission(missionId: string, nowMs: number) {
    if (!this.state.profile.factionId) return { ok: false as const, code: 'FACTION_REQUIRED' };
    if (this.state.profile.activeMissionId) return { ok: false as const, code: 'MISSION_ACTIVE' };
    const mission = this.state.missions.find((item) => item.id === missionId);
    if (!mission) return { ok: false as const, code: 'UNKNOWN_MISSION' };
    if (mission.status !== 'AVAILABLE') return { ok: false as const, code: 'INVALID_MISSION_STATE' };
    if (!mission.reachable) return { ok: false as const, code: 'MISSION_UNREACHABLE' };
    if (mission.factionId !== this.state.profile.factionId)
      return { ok: false as const, code: 'MISSION_AFFILIATION' };
    if (
      mission.cargo &&
      this.state.ship.mass.cargoKg + mission.cargo.massKg > this.state.ship.performance.cargoCapacityKg
    )
      return { ok: false as const, code: 'CARGO_CAPACITY' };
    mission.status = 'ACCEPTED';
    mission.acceptedAtMs = nowMs;
    this.state.profile.activeMissionId = mission.id;
    if (mission.cargo) {
      this.state.ship.mass.cargoKg += mission.cargo.massKg;
      this.state.ship.massKg = totalMassKg(this.state.ship.mass);
      this.syncActiveShipRecord();
    }
    return { ok: true as const };
  }
  private atDestination(mission: MissionInstance) {
    return (
      Math.abs(
        length(this.state.ship.position) - (CONFIG.earthRadius + mission.destination.altitudeKm * 1000),
      ) <= mission.destination.toleranceM
    );
  }
  private completeMission(mission: MissionInstance, nowMs: number) {
    if (mission.status !== 'ACTIVE') return { ok: false as const, code: 'INVALID_MISSION_STATE' };
    mission.status = 'COMPLETED';
    mission.completedAtMs = nowMs;
    this.state.profile.credits += mission.reward.credits;
    this.state.profile.reputation += mission.reward.reputation;
    this.state.profile.activeMissionId = undefined;
    return { ok: true as const };
  }
  deliverCargo(missionId: string, cargoId: string, destinationId: string, nowMs: number) {
    const mission = this.state.missions.find((item) => item.id === missionId);
    if (!mission) return { ok: false as const, code: 'UNKNOWN_MISSION' };
    if (mission.status !== 'ACTIVE') return { ok: false as const, code: 'INVALID_MISSION_STATE' };
    if (mission.type !== 'CARGO' || !mission.cargo) return { ok: false as const, code: 'INVALID_CARGO' };
    if (mission.cargo.id !== cargoId || mission.cargo.delivered)
      return { ok: false as const, code: 'INVALID_CARGO' };
    if (mission.destination.id !== destinationId) return { ok: false as const, code: 'WRONG_DESTINATION' };
    if (!this.atDestination(mission)) return { ok: false as const, code: 'NOT_AT_DESTINATION' };
    mission.cargo.delivered = true;
    this.state.ship.mass.cargoKg = Math.max(0, this.state.ship.mass.cargoKg - mission.cargo.massKg);
    this.state.ship.massKg = totalMassKg(this.state.ship.mass);
    this.syncActiveShipRecord();
    return this.completeMission(mission, nowMs);
  }
  startScan(missionId: string, destinationId: string) {
    const mission = this.state.missions.find((item) => item.id === missionId);
    if (!mission) return { ok: false as const, code: 'UNKNOWN_MISSION' };
    if (mission.status !== 'ACTIVE' || mission.type !== 'RECONNAISSANCE' || !mission.recon)
      return { ok: false as const, code: 'INVALID_MISSION_STATE' };
    if (mission.destination.id !== destinationId) return { ok: false as const, code: 'WRONG_DESTINATION' };
    if (!this.atDestination(mission)) return { ok: false as const, code: 'SCAN_UNAVAILABLE' };
    mission.recon.scanning = true;
    return { ok: true as const };
  }
  identifyTarget(missionId: string, destinationId: string, nowMs: number) {
    const mission = this.state.missions.find((item) => item.id === missionId);
    if (!mission) return { ok: false as const, code: 'UNKNOWN_MISSION' };
    if (mission.status !== 'ACTIVE' || mission.type !== 'INTERCEPT' || !mission.intercept)
      return { ok: false as const, code: 'INVALID_MISSION_STATE' };
    if (mission.destination.id !== destinationId) return { ok: false as const, code: 'WRONG_DESTINATION' };
    if (!this.atDestination(mission)) return { ok: false as const, code: 'IDENTIFY_UNAVAILABLE' };
    if (mission.intercept.identified) return { ok: false as const, code: 'TARGET_ALREADY_IDENTIFIED' };
    mission.intercept.identified = true;
    return this.completeMission(mission, nowMs);
  }
  abandonMission(missionId: string, nowMs: number) {
    const mission = this.state.missions.find((item) => item.id === missionId);
    if (!mission || !['ACCEPTED', 'ACTIVE'].includes(mission.status))
      return { ok: false as const, code: 'INVALID_MISSION_STATE' };
    if (mission.cargo && !mission.cargo.delivered) {
      this.state.ship.mass.cargoKg = Math.max(0, this.state.ship.mass.cargoKg - mission.cargo.massKg);
      this.state.ship.massKg = totalMassKg(this.state.ship.mass);
      this.syncActiveShipRecord();
    }
    mission.status = 'FAILED';
    mission.failedAtMs = nowMs;
    this.state.profile.activeMissionId = undefined;
    return { ok: true as const };
  }
  private advanceMission(nowMs: number) {
    const mission = this.state.missions.find((item) => item.id === this.state.profile.activeMissionId);
    if (!mission) return;
    if (mission.status === 'ACCEPTED') mission.status = 'ACTIVE';
    if (mission.status !== 'ACTIVE' || mission.type !== 'RECONNAISSANCE' || !mission.recon?.scanning) return;
    if (!this.atDestination(mission)) {
      mission.recon.scanning = false;
      mission.recon.progressSeconds = 0;
      return;
    }
    mission.recon.progressSeconds = Math.min(
      mission.recon.requiredSeconds,
      mission.recon.progressSeconds + CONFIG.fixedDt / this.state.ship.performance.sensorScanTimeMultiplier,
    );
    if (mission.recon.progressSeconds >= mission.recon.requiredSeconds) this.completeMission(mission, nowMs);
  }
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
    if (
      candidate.estimatedDeltaVMps >
      availableDeltaV(this.state.ship.mass, this.state.ship.performance.specificImpulseSeconds) + 1e-6
    )
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
    this.advanceMission(nowMs);
    this.syncActiveShipRecord();
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
