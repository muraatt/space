import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { ShipState } from '@orbital/shared';
import pg, { type Pool as PgPool, type PoolClient, type QueryResultRow } from 'pg';
import {
  credentialHash,
  IdentityConflict,
  normalizeUsername,
  type IdentityRecord,
  type IdentityRepository,
} from './identity-repository';

const { Pool } = pg;

interface IdentityRow extends QueryResultRow {
  player_id: string;
  username: string;
  normalized_username: string;
  credential_hash: string;
  ship_id: string;
  spawn_slot: number;
  ship_state: ShipState | null;
}

function toRecord(row: IdentityRow): IdentityRecord {
  return {
    playerId: row.player_id,
    username: row.username,
    normalizedUsername: row.normalized_username,
    credentialHash: row.credential_hash,
    shipId: row.ship_id,
    spawnSlot: row.spawn_slot,
    ship: row.ship_state ?? undefined,
  };
}

async function rollback(client: PoolClient) {
  try {
    await client.query('ROLLBACK');
  } catch {
    /* preserve the original failure */
  }
}

export class PostgresIdentityRepository implements IdentityRepository {
  private constructor(private readonly pool: PgPool) {}

  static async connect(connectionString: string) {
    const pool = new Pool({ connectionString, max: 5, connectionTimeoutMillis: 10_000 });
    const repository = new PostgresIdentityRepository(pool);
    try {
      const migration = await readFile(
        new URL('../../migrations/001_minimal_identity.sql', import.meta.url),
        'utf8',
      );
      await pool.query(migration);
      return repository;
    } catch (error) {
      await pool.end();
      throw error;
    }
  }

  async register(rawUsername: string, credential: string) {
    const normalized = normalizeUsername(rawUsername);
    if (!normalized) throw new RangeError('USERNAME_INVALID');
    const hash = credentialHash(credential),
      client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(674238091)');
      const existing = await client.query<IdentityRow>(
        'SELECT * FROM orbital_phase0_identities WHERE normalized_username = $1',
        [normalized.normalizedUsername],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].credential_hash !== hash) throw new IdentityConflict('USERNAME_TAKEN');
        await client.query('COMMIT');
        return { record: toRecord(existing.rows[0]), credential };
      }
      const credentialOwner = await client.query<IdentityRow>(
        'SELECT * FROM orbital_phase0_identities WHERE credential_hash = $1',
        [hash],
      );
      if (credentialOwner.rows[0]) throw new IdentityConflict('CREDENTIAL_IN_USE');
      const slot = await client.query<{ spawn_slot: number }>(
        'SELECT COALESCE(MAX(spawn_slot), -1)::integer + 1 AS spawn_slot FROM orbital_phase0_identities',
      );
      const record: IdentityRecord = {
        playerId: randomUUID(),
        username: normalized.username,
        normalizedUsername: normalized.normalizedUsername,
        credentialHash: hash,
        shipId: `ship-${randomUUID()}`,
        spawnSlot: slot.rows[0]?.spawn_slot ?? 0,
      };
      const inserted = await client.query<IdentityRow>(
        `INSERT INTO orbital_phase0_identities
          (player_id, username, normalized_username, credential_hash, ship_id, spawn_slot)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          record.playerId,
          record.username,
          record.normalizedUsername,
          record.credentialHash,
          record.shipId,
          record.spawnSlot,
        ],
      );
      await client.query('COMMIT');
      return { record: toRecord(inserted.rows[0]), credential };
    } catch (error) {
      await rollback(client);
      if ((error as { code?: string }).code === '23505') throw new IdentityConflict('IDENTITY_CONFLICT');
      throw error;
    } finally {
      client.release();
    }
  }

  async authenticate(credential: string) {
    const result = await this.pool.query<IdentityRow>(
      'SELECT * FROM orbital_phase0_identities WHERE credential_hash = $1',
      [credentialHash(credential)],
    );
    return result.rows[0] ? toRecord(result.rows[0]) : undefined;
  }

  async saveShip(playerId: string, ship: ShipState) {
    await this.pool.query(
      'UPDATE orbital_phase0_identities SET ship_state = $2::jsonb WHERE player_id = $1',
      [playerId, JSON.stringify(ship)],
    );
  }

  async health() {
    await this.pool.query('SELECT 1');
  }
}
