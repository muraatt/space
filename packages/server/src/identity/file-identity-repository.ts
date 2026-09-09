import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { ShipState } from '@orbital/shared';
import {
  credentialHash,
  IdentityConflict,
  normalizeUsername,
  type IdentityRecord,
  type IdentityRepository,
  type PilotCheckpoint,
} from './identity-repository';

export { IdentityConflict } from './identity-repository';

interface IdentityFile {
  version: 1;
  identities: IdentityRecord[];
}

export class FileIdentityRepository implements IdentityRepository {
  private static chains = new Map<string, Promise<unknown>>();
  constructor(readonly path: string) {}

  private async read(): Promise<IdentityFile> {
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8')) as IdentityFile;
      if (parsed.version !== 1 || !Array.isArray(parsed.identities)) throw new Error('INVALID_IDENTITY_FILE');
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, identities: [] };
      throw error;
    }
  }

  private async write(data: IdentityFile) {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, this.path);
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const key = resolve(this.path).toLowerCase();
    const next = (FileIdentityRepository.chains.get(key) ?? Promise.resolve()).then(operation, operation);
    const tracked = next.then(
      () => undefined,
      () => undefined,
    );
    FileIdentityRepository.chains.set(key, tracked);
    void tracked.finally(() => { if (FileIdentityRepository.chains.get(key) === tracked) FileIdentityRepository.chains.delete(key); });
    return next;
  }

  async register(
    rawUsername: string,
    credential: string,
  ): Promise<{ record: IdentityRecord; credential: string }> {
    const normalized = normalizeUsername(rawUsername);
    if (!normalized) throw new RangeError('USERNAME_INVALID');
    return this.serial(async () => {
      const data = await this.read();
      const existing = data.identities.find(
        (item) => item.normalizedUsername === normalized.normalizedUsername,
      );
      if (existing) {
        if (existing.credentialHash === credentialHash(credential))
          return { record: structuredClone(existing), credential };
        throw new IdentityConflict('USERNAME_TAKEN');
      }
      if (data.identities.some(item => item.credentialHash === credentialHash(credential))) throw new IdentityConflict('CREDENTIAL_IN_USE');
      const record: IdentityRecord = {
        playerId: randomUUID(),
        username: normalized.username,
        normalizedUsername: normalized.normalizedUsername,
        credentialHash: credentialHash(credential),
        shipId: `ship-${randomUUID()}`,
        spawnSlot: Math.max(-1, ...data.identities.map(item => item.spawnSlot)) + 1,
        createdAtMs: Date.now(),
      };
      data.identities.push(record);
      await this.write(data);
      return { record: structuredClone(record), credential };
    });
  }

  async authenticate(credential: string) {
    return this.serial(async () => {
    const hash = credentialHash(credential),
      data = await this.read();
    const record = data.identities.find((item) => item.credentialHash === hash);
    return record ? structuredClone(record) : undefined;
    });
  }

  async saveShip(playerId: string, ship: ShipState, checkpoint?: PilotCheckpoint) {
    return this.serial(async () => {
      const data = await this.read(),
        record = data.identities.find((item) => item.playerId === playerId);
      if (!record) throw new Error('IDENTITY_NOT_FOUND');
      if (data.identities.some(item => item.playerId !== playerId && item.shipId === ship.id)) throw new IdentityConflict('SHIP_IN_USE');
      record.shipId = ship.id;
      record.ship = structuredClone(ship);
      record.checkpoint = structuredClone(checkpoint);
      await this.write(data);
    });
  }

  async health() {}
}
