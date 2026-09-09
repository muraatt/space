import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { FileIdentityRepository } from './file-identity-repository';
import { PostgresIdentityRepository } from './postgres-identity-repository';
import { IdentityConflict, type IdentityRepository } from './identity-repository';
import { SharedSandbox } from '../shared-sandbox';
import { CONFIG } from '@orbital/shared';
import { totalMassKg } from '@orbital/simulation';

describe('CAN-003/004/013/014/016/019: identical real adapter contract', () => {
  let directory: string;
  const pools: PostgresIdentityRepository[] = [];
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'orbital-pass2-contract-'));
  });
  afterAll(async () => {
    await Promise.all(pools.map(pool => pool.close()));
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  const configuredAdapters = process.env.TEST_DATABASE_URL ? ['file', 'postgres'] as const : ['file'] as const;
  for (const adapter of configuredAdapters) describe(adapter, () => {
    async function repositories() {
      const path = join(directory, `${randomUUID()}.json`);
      const open = async (): Promise<IdentityRepository> => {
        if (adapter === 'file') return new FileIdentityRepository(path);
        const pool = await PostgresIdentityRepository.connect(process.env.TEST_DATABASE_URL!); pools.push(pool); return pool;
      };
      return { first: await open(), second: await open(), open, path };
    }
    const credential = () => randomBytes(32).toString('base64url');
    const callsign = () => `P_${randomBytes(6).toString('hex')}`;
    it('reserves callsigns and credentials once, with concurrent retries and distinct slots', async () => {
      const { first, second, path } = await repositories(), name = callsign(), key = credential();
      const records = await Promise.all(Array.from({ length: 8 }, (_, i) => (i % 2 ? first : second).register(name, key)));
      expect(new Set(records.map(item => item.record.playerId)).size).toBe(1);
      expect((await second.register(` ${name.toLowerCase()} `, key)).record.shipId).toBe(records[0].record.shipId);
      await expect(second.register(name, credential())).rejects.toBeInstanceOf(IdentityConflict);
      await expect(second.register(callsign(), key)).rejects.toBeInstanceOf(IdentityConflict);
      const many = await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? first : second).register(callsign(), credential())));
      expect(new Set(many.map(item => item.record.spawnSlot)).size).toBe(12);
      expect(new Set(many.map(item => item.record.shipId)).size).toBe(12);
      if (adapter === 'file') expect(await readFile(path, 'utf8')).not.toContain(key);
      // Introduce a gap through the storage boundary; allocation is MAX+1, not count.
      if (adapter === 'file') {
        const data = JSON.parse(await readFile(path, 'utf8'));
        data.identities.pop(); data.identities[0].spawnSlot = 400;
        await writeFile(path, JSON.stringify(data));
      } else {
        const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await client.connect();
        await client.query('UPDATE orbital_phase0_identities SET spawn_slot = 400 WHERE player_id = $1', [records[0].record.playerId]);
        await client.end();
      }
      expect((await first.register(callsign(), credential())).record.spawnSlot).toBe(401);
    });
    it('keeps two replacement identities coherent through save, reconstruction and ownership checks', async () => {
      const { first, second } = await repositories(), sandbox = new SharedSandbox(first);
      const a = await sandbox.register(callsign(), credential()), b = await sandbox.register(callsign(), credential());
      sandbox.connect(a.runtime); sandbox.connect(b.runtime);
      for (const pilot of [a, b]) {
        const world = pilot.runtime.world;
        world.receivePlayerDamage('fatal', 1000, 1);
        expect(world.claimReplacement('recover', 2).ok).toBe(true);
        await sandbox.persist(pilot.runtime);
      }
      sandbox.prepareSnapshots();
      expect(a.runtime.world.state.ship.id).not.toBe(b.runtime.world.state.ship.id);
      expect(a.runtime.world.state.remotePlayers[0].shipId).toBe(b.runtime.world.state.ship.id);
      await expect(second.saveShip(b.record.playerId, a.runtime.world.state.ship)).rejects.toBeInstanceOf(IdentityConflict);
      const restarted = new SharedSandbox(second);
      for (const pilot of [a, b]) {
        const record = (await second.authenticate(pilot.credential))!, resumed = (await restarted.resume(pilot.credential))!;
        const shipId = pilot.runtime.world.state.ship.id;
        expect(record.shipId).toBe(shipId); expect(record.ship?.id).toBe(shipId);
        expect(restarted.identity(resumed.record).shipId).toBe(shipId);
        expect(resumed.runtime.world.state.profile).toMatchObject({ activeShipId: shipId, ownedShipIds: [shipId] });
        expect(resumed.runtime.world.state.combat.playerDestroyed).toBe(false);
        expect(resumed.runtime.world.claimReplacement('recover', 3)).toMatchObject({ code: 'DUPLICATE_TRANSACTION' });
      }
    });
    it.each(['healthy', 'damaged', 'destroyed', 'recovered'] as const)('restores the %s lifecycle without healing damage', async lifecycle => {
      const { first, second } = await repositories(), sandbox = new SharedSandbox(first), pilot = await sandbox.register(callsign(), credential());
      const world = pilot.runtime.world;
      world.state.ship.conditionPercent = 100; world.restoreCheckpoint();
      if (lifecycle !== 'healthy') world.receivePlayerDamage('damage', lifecycle === 'damaged' ? 80 : 1000, 1);
      if (lifecycle === 'recovered') expect(world.claimReplacement('replace', 2).ok).toBe(true);
      await sandbox.persist(pilot.runtime);
      const resumed = (await new SharedSandbox(second).resume(pilot.credential))!.runtime.world;
      expect(resumed.state.combat.playerHull).toBe(world.state.ship.conditionPercent);
      expect(resumed.state.combat.playerDestroyed).toBe(lifecycle === 'destroyed');
      expect(resumed.state.combat.modules).toEqual(world.state.combat.modules);
      expect(resumed.state.combat.recovery).toEqual(world.state.combat.recovery);
      if (lifecycle === 'damaged') { resumed.receivePlayerDamage('more', 5, 3); expect(resumed.state.ship.conditionPercent).toBe(15); }
    });
    it('commits credits, purchased value and lifetime economic replay IDs atomically past 256 operations/restart', async () => {
      const { first, second } = await repositories(), sandbox = new SharedSandbox(first), pilot = await sandbox.register(callsign(), credential());
      const world = pilot.runtime.world;
      world.state.docking.phase = 'DOCKED'; world.state.docking.selectedStationId = world.state.station.id;
      world.state.profile.credits = 20_000; // Earned-credit fixture; prices and service checks remain real.
      const before = world.state.profile.credits;
      expect(world.installUpgrade('extended-propellant-cell', 'upgrade').ok).toBe(true);
      expect(world.buyAmmunition(1, 'ammo').ok).toBe(true);
      expect(world.buyFuel(1, 'oldest-fuel').ok).toBe(true);
      for (let i = 0; i < 270; i++) expect(world.buyFuel(0.01, `fuel-${i}`).ok).toBe(true);
      expect(world.state.hangar.processedTransactionIds).not.toContain('oldest-fuel');
      expect(world.buyFuel(1, 'oldest-fuel')).toMatchObject({ code: 'DUPLICATE_TRANSACTION' });
      const expected = structuredClone(world.state.ship), credits = world.state.profile.credits;
      expect(credits).toBeLessThan(before);
      await sandbox.persist(pilot.runtime);
      const restored = (await new SharedSandbox(second).resume(pilot.credential))!.runtime.world;
      expect(restored.state.profile.credits).toBe(credits);
      expect(restored.state.ship.mass).toEqual(expected.mass);
      expect(restored.state.ship.massKg).toBe(totalMassKg(expected.mass));
      expect(restored.state.ship.installedUpgradeIds).toEqual(expected.installedUpgradeIds);
      for (const id of ['upgrade', 'ammo', 'oldest-fuel', 'fuel-0']) expect(restored.buyFuel(1, id)).toMatchObject({ code: 'DUPLICATE_TRANSACTION' });
      expect(restored.state.profile.credits).toBe(credits);
      expect(restored.state.combat.processedCommandIds).toEqual([]);
      expect(CONFIG.fixedDt).toBeGreaterThan(0);
    });
  });
});
