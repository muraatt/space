# Shared sandbox deployment

Phase 0 uses a static Vercel frontend and one long-lived authoritative Node server. The continuous 60 Hz world loop and WebSocket sessions do not run in Vercel Functions. The Node authority is packaged by `Dockerfile.authority`; `render.yaml` deploys both the authority and its minimal identity store on Render's free plans. Production selects the PostgreSQL identity adapter through `DATABASE_URL`; local development keeps the file adapter when that variable is absent. This remains a narrow Phase 0 repository, not the full Session 5 persistence system.

The PostgreSQL row contains player ID, locked callsign, normalized unique callsign, SHA-256 credential verifier, assigned ship ID, spawn slot and the minimum authoritative ship snapshot needed for restoration. Registration is serialized in a database transaction and the schema independently enforces unique callsigns, credential verifiers, player IDs and ship IDs. The bearer credential exists only in the registering browser's local storage and is never written to PostgreSQL or the UI. This prototype has no password recovery; clearing browser storage loses access until an operator recovery tool exists.

Render Free Postgres expires 30 days after creation, has no backups, and allows only one free database per workspace. After expiry the closed-alpha identity data becomes unavailable unless the database is upgraded during Render's grace period. This limitation is accepted only for the prototype and the public test URL must not be described as durable production hosting.

## Environment

Backend:

- `HOST=0.0.0.0`
- `PORT=8787`
- `DATABASE_URL=<Render internal Postgres connection string>` (injected from the Blueprint; never committed)
- `ALLOWED_ORIGINS=https://<vercel-project>.vercel.app` (comma-separated for multiple exact origins)

Frontend build:

- `VITE_GAME_SERVER_URL=wss://<authority-host>`

Local development needs no environment changes. Vite proxies `/socket` to `127.0.0.1:8787` and identities go to `.data/identities.json` when `DATABASE_URL` is unset.

## Manual deployment

1. Create the backend from `render.yaml`. The Blueprint provisions a Free Web Service and Free Postgres database and injects the internal connection string as `DATABASE_URL`.
2. Set `ALLOWED_ORIGINS` to the final Vercel HTTPS origin and deploy the authority. Confirm `https://<authority-host>/health` reports `file-identity`.
3. Import this repository into Vercel, keep the repository root, and set `VITE_GAME_SERVER_URL` to the backend `wss://` origin.
4. Deploy the Vercel project. If Vercel assigns a different production hostname, update `ALLOWED_ORIGINS` and redeploy the backend.
5. Open the public URL in two independent browser profiles, register two callsigns, verify both markers and OPS presence, move each ship, then refresh both browsers and confirm stable ship IDs.

No paid resource is required by this configuration. Render Free Web Services can spin down when idle, so the first connection after inactivity can take longer and the browser reconnect loop may be visible. Free Postgres expires after 30 days.
