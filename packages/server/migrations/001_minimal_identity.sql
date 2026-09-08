CREATE TABLE IF NOT EXISTS orbital_phase0_identities (
  player_id uuid PRIMARY KEY,
  username varchar(20) NOT NULL,
  normalized_username varchar(20) NOT NULL UNIQUE,
  credential_hash char(64) NOT NULL UNIQUE,
  ship_id text NOT NULL UNIQUE,
  spawn_slot integer NOT NULL UNIQUE CHECK (spawn_slot >= 0),
  ship_state jsonb
);
