import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileIdentityRepository, IdentityConflict } from './file-identity-repository';
import { SharedSandbox } from '../shared-sandbox';
import { dispatch } from '../commands/dispatch';
import type { IdentityRecord, IdentityRepository } from './identity-repository';
import { IdentityRestoreError } from './persisted-ship';

describe('minimal durable shared identity', () => {
  let directory = '';
  afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });
  async function setup() {
    directory = await mkdtemp(join(tmpdir(), 'orbital-identities-'));
    const path = join(directory, 'identities.json');
    return { path, repository: new FileIdentityRepository(path) };
  }

  it('atomically reserves normalized usernames and never persists the bearer credential', async () => {
    const { path, repository } = await setup();
    const credential = 'a'.repeat(43), first = await repository.register('  Murat One  ', credential);
    await expect(repository.register('murat one', 'b'.repeat(43))).rejects.toBeInstanceOf(IdentityConflict);
    expect((await repository.register('MURAT ONE', credential)).record.shipId).toBe(first.record.shipId);
    expect(await repository.authenticate(first.credential)).toMatchObject({ playerId: first.record.playerId });
    expect(await readFile(path, 'utf8')).not.toContain(first.credential);
  });

  it('creates one stable ship, restores it after a backend restart and rejects foreign ownership', async () => {
    const { path, repository } = await setup(), sandbox = new SharedSandbox(repository);
    const a = await sandbox.register('ALPHA_01', 'a'.repeat(43)), b = await sandbox.register('BRAVO_02', 'b'.repeat(43));
    expect(a.runtime.world.state.profile.ownedShipIds).toEqual([a.record.shipId]);
    expect(b.runtime.world.state.profile.ownedShipIds).toEqual([b.record.shipId]);
    expect(a.runtime.world.state.ship.position).not.toEqual(b.runtime.world.state.ship.position);
    sandbox.connect(a.runtime); sandbox.connect(b.runtime); sandbox.prepareSnapshots();
    expect(a.runtime.world.state.remotePlayers[0]).toMatchObject({ playerId: b.record.playerId, shipId: b.record.shipId, presence: 'ONLINE' });
    const foreign = dispatch(a.runtime.world.state, {
      type: 'input', version: 1, shipId: b.record.shipId, seq: 1,
      translation: [0, 0, -1], rotation: [0, 0, 0],
    }, a.record.shipId);
    expect(foreign).toEqual({ ok: false, code: 'NOT_OWNER' });
    a.runtime.world.state.ship.position[1] += 123;
    await sandbox.flush();
    const resumed = await new SharedSandbox(new FileIdentityRepository(path)).resume(a.credential);
    expect(resumed?.runtime.world.state.ship.id).toBe(a.record.shipId);
    expect(resumed?.runtime.world.state.ship.position[1]).toBeCloseTo(a.runtime.world.state.ship.position[1]);
    expect(resumed?.runtime.world.state.profile.ownedShipIds).toEqual([a.record.shipId]);
  });

  it('isolates a malformed persisted ship while other identities keep running', async () => {
    const validShip = structuredClone(new SharedSandbox((await setup()).repository).legacyWorld.state.ship),
      badRecord: IdentityRecord = {
        playerId: 'bad-player', username: 'BAD_SHIP', normalizedUsername: 'bad_ship',
        credentialHash: 'bad-hash', shipId: 'bad-ship', spawnSlot: 0,
        ship: { ...validShip, id: 'bad-ship', massKg: Number.NaN },
      },
      goodRecord: IdentityRecord = {
        playerId: 'good-player', username: 'GOOD_SHIP', normalizedUsername: 'good_ship',
        credentialHash: 'good-hash', shipId: 'good-ship', spawnSlot: 1,
        ship: { ...validShip, id: 'good-ship' },
      },
      repository: IdentityRepository = {
        async register() { throw new Error('unused'); },
        async authenticate(value) { return value === 'b'.repeat(43) ? badRecord : goodRecord; },
        async saveShip() {},
        async health() {},
      },
      sandbox = new SharedSandbox(repository);
    await expect(sandbox.resume('b'.repeat(43))).rejects.toBeInstanceOf(IdentityRestoreError);
    const good = await sandbox.resume('g'.repeat(43));
    expect(good?.runtime.world.state.ship.id).toBe('good-ship');
    expect(() => good?.runtime.world.tick(1, 1)).not.toThrow();
  });

  it('contains background save rejection, reports degradation, and retries dirty state', async () => {
    const { repository } = await setup(), save = vi.spyOn(repository, 'saveShip'),
      reports: string[] = [], sandbox = new SharedSandbox(repository, (message) => reports.push(message)),
      created = await sandbox.register('RETRY_01', 'r'.repeat(43));
    save.mockRejectedValueOnce(new Error('disk temporarily unavailable'));
    sandbox.connect(created.runtime);
    sandbox.disconnect(created.runtime);
    await vi.waitFor(() => expect(reports).toHaveLength(1));
    expect(sandbox.persistenceStatus().degraded).toBe(true);
    sandbox.connect(created.runtime);
    expect(() => sandbox.tick(1)).not.toThrow();
    expect(created.runtime.world.state.tick).toBeGreaterThan(0);
    await expect(sandbox.flush()).resolves.toBeUndefined();
    expect(sandbox.persistenceStatus()).toEqual({ degraded: false, dirtyPlayerIds: [] });
    expect(save).toHaveBeenCalledTimes(3);
  });
});
