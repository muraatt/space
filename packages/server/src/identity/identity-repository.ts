import { createHash } from 'node:crypto';
import type { ShipState, CombatState, FactionId } from '@orbital/shared';

/** Atomic Phase-0 checkpoint, not a shared mission/NPC database. */
export interface PilotCheckpoint {
  version: 1;
  credits: number;
  reputation: number;
  factionId?: FactionId;
  modules: CombatState['modules'];
  recovery?: CombatState['recovery'];
  wrecks: CombatState['wrecks'];
  economicTransactionIds: string[];
  completedMissionTemplateIds: string[];
  missionCargoKg: number;
}

export interface IdentityRecord {
  playerId: string;
  username: string;
  normalizedUsername: string;
  credentialHash: string;
  shipId: string;
  spawnSlot: number;
  createdAtMs?: number;
  ship?: ShipState;
  checkpoint?: PilotCheckpoint;
}

export interface IdentityRepository {
  register(rawUsername: string, credential: string): Promise<{ record: IdentityRecord; credential: string }>;
  authenticate(credential: string): Promise<IdentityRecord | undefined>;
  saveShip(playerId: string, ship: ShipState, checkpoint?: PilotCheckpoint): Promise<void>;
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
