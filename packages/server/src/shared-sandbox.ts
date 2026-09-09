import { CONFIG, neutralControls, type PublicPlayerIdentity, type RemotePlayerState } from '@orbital/shared';
import { add, scale, normalize, length, cross, propagateKepler, sub } from '@orbital/simulation';
import { World } from './world';
import type { IdentityRecord, IdentityRepository } from './identity/identity-repository';
import { assertRestorableShip, assertPilotCheckpoint } from './identity/persisted-ship';

export interface SharedPilotRuntime { record: IdentityRecord; world: World; presence: RemotePlayerState['presence']; connections: number; inactiveSince: number; busy: boolean; testClockOffsetMs?: number }
export const DISCONNECT_GRACE_MS = 60_000;

export class SharedSandbox {
  readonly legacyWorld = new World();
  private pilots = new Map<string, SharedPilotRuntime>();
  private lastPersistAt = 0;
  private persistPending = false;
  private dirtyPlayerIds = new Set<string>();
  private persistChains = new Map<string, Promise<void>>();
  private stationAnchor = structuredClone(new World().state.station);
  constructor(
    readonly identities: IdentityRepository,
    private readonly reportPersistenceError: (message: string, error: unknown) => void = (message, error) =>
      console.error(message, error instanceof Error ? error.name : 'Unknown persistence error'),
    private readonly clock: () => number = Date.now,
  ) {}

  private report(message: string, error: unknown) {
    try { this.reportPersistenceError(message, error); } catch { /* reporting must not crash authority */ }
  }

  private queueSave(runtime: SharedPilotRuntime, reason: string, strict = false) {
    const playerId = runtime.record.playerId,
      ship = structuredClone(runtime.world.state.ship),
      checkpoint = runtime.world.checkpoint(),
      previous = this.persistChains.get(playerId) ?? Promise.resolve(),
      next = previous.catch(() => {}).then(async () => {
        try {
          await this.identities.saveShip(playerId, ship, checkpoint);
          runtime.record.shipId = runtime.world.state.ship.id;
          this.dirtyPlayerIds.delete(playerId);
        } catch (error) {
          this.dirtyPlayerIds.add(playerId);
          this.report(`[identity-persistence] ${reason} failed for player ${playerId}`, error);
          if (strict) throw error;
        }
      }),
      tracked = next.finally(() => {
        if (this.persistChains.get(playerId) === tracked) this.persistChains.delete(playerId);
      });
    this.dirtyPlayerIds.add(playerId);
    this.persistChains.set(playerId, tracked);
    return tracked;
  }

  private createWorld(record: IdentityRecord) {
    const world = new World();
    world.reset('bounty_sandbox');
    this.syncStation(world);
    if (record.ship) assertRestorableShip(record.ship, record.shipId);
    if (record.checkpoint) {
      if (!record.ship) throw new Error('CHECKPOINT_WITHOUT_SHIP');
      assertPilotCheckpoint(record.checkpoint, record.ship);
    }
    const ship = structuredClone(record.ship ?? world.state.ship);
    ship.id = record.shipId;
    if (!record.ship) {
      const ring = Math.floor(record.spawnSlot / 8), angle = (record.spawnSlot % 8) * Math.PI / 4;
      const radial = 420 + ring * 120;
      const station = world.state.station, radialAxis = normalize(station.position), prograde = normalize(station.velocity);
      ship.position = add(station.position, add(scale(radialAxis, Math.sin(angle) * radial), scale(prograde, -(180 + Math.cos(angle) * radial))));
      const normal = normalize(cross(station.position, station.velocity));
      ship.velocity = scale(normalize(cross(normal, ship.position)), Math.sqrt(CONFIG.earthMu / length(ship.position)));
      ship.orientation = [0, 0, 0, 1];
      ship.angularVelocity = [0, 0, 0];
    }
    world.state.ship = ship;
    world.state.hangar.ships = [structuredClone(ship)];
    world.state.profile.playerId = record.playerId;
    world.state.profile.ownedShipIds = [record.shipId];
    world.state.profile.activeShipId = record.shipId;
    world.state.controls = neutralControls();
    world.state.remotePlayers = [];
    world.state.docking = {
      ...world.state.docking, phase: 'NONE', selectedStationId: undefined, portId: undefined,
      guidance: 'SELECT_STATION', metrics: undefined, rendezvousComplete: false,
    };
    if (record.ship) {
      world.restoreCheckpoint(record.checkpoint);
      // Old ship-only records have no trustworthy historical credit balance.
      if (!record.checkpoint) world.state.profile.credits = 0;
    }
    return world;
  }

  private runtime(record: IdentityRecord) {
    let runtime = this.pilots.get(record.playerId);
    if (!runtime) {
      if (this.pilots.size >= 256) throw new Error('RUNTIME_CAPACITY');
      runtime = { record, world: this.createWorld(record), presence: 'OFFLINE', connections: 0, inactiveSince: this.clock(), busy: false };
      this.pilots.set(record.playerId, runtime);
    }
    return runtime;
  }

  async register(username: string, credential: string) {
    const created = await this.identities.register(username, credential), runtime = this.runtime(created.record);
    try {
      await this.queueSave(runtime, 'initial ship save', true);
    } catch (error) {
      this.dirtyPlayerIds.add(created.record.playerId);
      this.report(`[identity-persistence] initial ship save failed for player ${created.record.playerId}`, error);
      throw error;
    }
    return { ...created, record: runtime.record, runtime };
  }

  async resume(credential: string) {
    const record = await this.identities.authenticate(credential);
    if (!record) return undefined;
    const runtime = this.runtime(record);
    runtime.record.shipId = runtime.world.state.ship.id;
    return { record: runtime.record, runtime };
  }

  connect(runtime: SharedPilotRuntime) { runtime.connections++; runtime.presence = 'ONLINE'; }
  disconnect(runtime: SharedPilotRuntime) {
    if (this.pilots.get(runtime.record.playerId) !== runtime) return;
    runtime.connections = Math.max(0, runtime.connections - 1);
    runtime.presence = runtime.connections ? 'ONLINE' : 'OFFLINE';
    if (!runtime.connections) {
      runtime.inactiveSince = this.clock();
      runtime.world.state.controls = neutralControls();
      if (!runtime.busy) void this.queueSave(runtime, 'disconnect save');
    }
  }
  identity(record: IdentityRecord): PublicPlayerIdentity {
    return { playerId: record.playerId, callsign: record.username, shipId: this.pilots.get(record.playerId)?.world.state.ship.id ?? record.shipId };
  }
  private syncStation(world: World, atMs = this.clock()) {
    const station = propagateKepler(this.stationAnchor, (atMs - CONFIG.epochMs) / 1000);
    const delta = sub(station.position, world.state.station.position);
    world.state.station.position = station.position;
    world.state.station.velocity = station.velocity;
    world.state.docking.stationUpdatedAtMs = atMs;
    if (world.state.docking.phase === 'DOCKED') {
      world.state.ship.position = add(world.state.ship.position, delta);
      world.state.ship.velocity = [...station.velocity];
    }
  }
  async persist(runtime: SharedPilotRuntime) { await this.queueSave(runtime, 'durable operation', true); }
  invalidate(runtime: SharedPilotRuntime) {
    runtime.busy = true;
    this.pilots.delete(runtime.record.playerId);
    this.dirtyPlayerIds.delete(runtime.record.playerId);
  }
  async evictInactive() {
    for (const [id, runtime] of this.pilots) {
      if (runtime.connections || runtime.busy || this.clock() - runtime.inactiveSince < DISCONNECT_GRACE_MS) continue;
      await this.queueSave(runtime, 'eviction save');
      if (!runtime.connections && !runtime.busy && !this.dirtyPlayerIds.has(id) && this.clock() - runtime.inactiveSince >= DISCONNECT_GRACE_MS)
        this.pilots.delete(id);
    }
  }
  runtimeCount() { return this.pilots.size; }
  worldForTest(playerId: string) { return this.pilots.get(playerId)?.world; }
  advanceManeuverForTest(playerId: string) {
    const runtime = this.pilots.get(playerId), world = runtime?.world,
      nextEventAtMs = world?.state.maneuver?.nextEventAtMs;
    if (!runtime || !world || !nextEventAtMs || world.state.maneuver?.status !== 'COASTING') return undefined;
    runtime.testClockOffsetMs = nextEventAtMs + 1 - this.clock();
    world.tick(performance.now(), nextEventAtMs + 1);
    this.syncStation(world, nextEventAtMs + 1);
    return nextEventAtMs + 1;
  }
  tick(now: number) {
    this.legacyWorld.tick(now);
    for (const pilot of this.pilots.values()) if (pilot.connections && !pilot.busy) {
      const atMs = this.clock() + (pilot.testClockOffsetMs ?? 0);
      pilot.world.tick(now, atMs); this.syncStation(pilot.world, atMs);
    }
    if (!this.persistPending && now - this.lastPersistAt >= 5_000) {
      this.lastPersistAt = now; this.persistPending = true;
      void this.flush().then(() => this.evictInactive()).finally(() => { this.persistPending = false; });
    }
  }
  prepareSnapshots() {
    const list = [...this.pilots.values()].filter(pilot => pilot.connections && !pilot.busy);
    const atMs = this.clock();
    for (const pilot of list) {
      this.syncStation(pilot.world, atMs + (pilot.testClockOffsetMs ?? 0));
      pilot.record.shipId = pilot.world.state.ship.id;
    }
    for (const local of list) local.world.state.remotePlayers = list
      .filter((remote) => remote !== local)
      .map((remote) => ({
        ...this.identity(remote.record), presence: remote.presence,
          ship: structuredClone(remote.world.state.ship),
      }));
  }
  async flush() {
    await Promise.all([...this.pilots.values()].filter(pilot => !pilot.busy).map((pilot) => this.queueSave(pilot, 'background flush')));
  }
  persistenceStatus() {
    return { degraded: this.dirtyPlayerIds.size > 0, dirtyPlayerIds: [...this.dirtyPlayerIds] };
  }
}
