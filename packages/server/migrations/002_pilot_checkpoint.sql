-- Credits, lifetime economic receipts and active-ship lifecycle share one row/write.
ALTER TABLE orbital_phase0_identities ADD COLUMN IF NOT EXISTS checkpoint jsonb;
