import { neutralControls, type PublicPlayerIdentity, type RemotePlayerState } from '@orbital/shared';
import { add } from '@orbital/simulation';
import { World } from './world';
import { FileIdentityRepository, type IdentityRecord } from './identity/file-identity-repository';

export interface SharedPilotRuntime { record: IdentityRecord; world: World; presence: RemotePlayerState['presence']; connections: number }

export class SharedSandbox {
  readonly legacyWorld = new World();
  private pilots = new Map<string, SharedPilotRuntime>();
  private lastPersistAt = 0;
  private persistPending = false;
  constructor(readonly identities: FileIdentityRepository) {}

  private createWorld(record: IdentityRecord) {
    const world = new World();
    world.reset('bounty_sandbox');
    const ship = structuredClone(record.ship ?? world.state.ship);
    ship.id = record.shipId;
    if (!record.ship) {
      const ring = Math.floor(record.spawnSlot / 8), angle = (record.spawnSlot % 8) * Math.PI / 4;
      const radial = 420 + ring * 120;
      ship.position = add(world.state.station.position, [0, Math.sin(angle) * radial, 180 + Math.cos(angle) * radial]);
      ship.velocity = [...world.state.station.velocity];
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
    return world;
  }

  private runtime(record: IdentityRecord) {
    let runtime = this.pilots.get(record.playerId);
    if (!runtime) {
      runtime = { record, world: this.createWorld(record), presence: 'ONLINE', connections: 0 };
      this.pilots.set(record.playerId, runtime);
    }
    return runtime;
  }

  async register(username: string, credential: string) {
    const created = await this.identities.register(username, credential), runtime = this.runtime(created.record);
    await this.identities.saveShip(created.record.playerId, runtime.world.state.ship);
    return { ...created, runtime };
  }

  async resume(credential: string) {
    const record = await this.identities.authenticate(credential);
    return record ? { record, runtime: this.runtime(record) } : undefined;
  }

  connect(runtime: SharedPilotRuntime) { runtime.connections++; runtime.presence = 'ONLINE'; }
  disconnect(runtime: SharedPilotRuntime) {
    runtime.connections = Math.max(0, runtime.connections - 1);
    runtime.presence = runtime.connections ? 'ONLINE' : 'OFFLINE';
    runtime.world.state.controls = neutralControls();
    void this.identities.saveShip(runtime.record.playerId, runtime.world.state.ship);
  }
  identity(record: IdentityRecord): PublicPlayerIdentity {
    return { playerId: record.playerId, callsign: record.username, shipId: record.shipId };
  }
  tick(now: number) {
    this.legacyWorld.tick(now);
    for (const pilot of this.pilots.values()) if (pilot.connections) pilot.world.tick(now);
    if (!this.persistPending && now - this.lastPersistAt >= 5_000) {
      this.lastPersistAt = now; this.persistPending = true;
      void this.flush().finally(() => { this.persistPending = false; });
    }
  }
  prepareSnapshots() {
    const list = [...this.pilots.values()];
    for (const local of list) local.world.state.remotePlayers = list
      .filter((remote) => remote !== local)
      .map((remote) => ({
        ...this.identity(remote.record), presence: remote.presence,
        ship: structuredClone(remote.world.state.ship),
      }));
  }
  async flush() {
    await Promise.all([...this.pilots.values()].map((p) => this.identities.saveShip(p.record.playerId, p.world.state.ship)));
  }
}
