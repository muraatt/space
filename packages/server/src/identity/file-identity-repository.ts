import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ShipState } from '@orbital/shared';
import {
  credentialHash,
  IdentityConflict,
  normalizeUsername,
  type IdentityRecord,
  type IdentityRepository,
} from './identity-repository';

export { IdentityConflict } from './identity-repository';

interface IdentityFile {
  version: 1;
  identities: IdentityRecord[];
}

export class FileIdentityRepository implements IdentityRepository {
  private chain: Promise<unknown> = Promise.resolve();
  constructor(readonly path: string) {}

  private async read(): Promise<IdentityFile> {
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8')) as IdentityFile;
      return parsed.version === 1 && Array.isArray(parsed.identities)
        ? parsed
        : { version: 1, identities: [] };
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
    const next = this.chain.then(operation, operation);
    this.chain = next.then(
      () => undefined,
      () => undefined,
    );
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
      const record: IdentityRecord = {
        playerId: randomUUID(),
        username: normalized.username,
        normalizedUsername: normalized.normalizedUsername,
        credentialHash: credentialHash(credential),
        shipId: `ship-${randomUUID()}`,
        spawnSlot: data.identities.length,
        createdAtMs: Date.now(),
      };
      data.identities.push(record);
      await this.write(data);
      return { record: structuredClone(record), credential };
    });
  }

  async authenticate(credential: string) {
    const hash = credentialHash(credential),
      data = await this.read();
    const record = data.identities.find((item) => item.credentialHash === hash);
    return record ? structuredClone(record) : undefined;
  }

  async saveShip(playerId: string, ship: ShipState) {
    return this.serial(async () => {
      const data = await this.read(),
        record = data.identities.find((item) => item.playerId === playerId);
      if (!record) return;
      record.ship = structuredClone(ship);
      await this.write(data);
    });
  }

  async health() {}
}
