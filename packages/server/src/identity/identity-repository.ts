import { createHash } from 'node:crypto';
import type { ShipState } from '@orbital/shared';

export interface IdentityRecord {
  playerId: string;
  username: string;
  normalizedUsername: string;
  credentialHash: string;
  shipId: string;
  spawnSlot: number;
  createdAtMs?: number;
  ship?: ShipState;
}

export interface IdentityRepository {
  register(rawUsername: string, credential: string): Promise<{ record: IdentityRecord; credential: string }>;
  authenticate(credential: string): Promise<IdentityRecord | undefined>;
  saveShip(playerId: string, ship: ShipState): Promise<void>;
  health(): Promise<void>;
}

export class IdentityConflict extends Error {}

export const credentialHash = (credential: string) =>
  createHash('sha256').update(credential, 'utf8').digest('hex');

export function normalizeUsername(input: string) {
  const username = input.trim().replace(/\s+/g, ' ');
  if (username.length < 3 || username.length > 20 || !/^[A-Za-z0-9 _-]+$/.test(username)) return undefined;
  return { username, normalizedUsername: username.toLocaleLowerCase('en-US') };
}
