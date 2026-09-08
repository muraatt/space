# Shared sandbox deployment

Phase 0 uses a static Vercel frontend and one long-lived authoritative Node server. The continuous 60 Hz world loop and WebSocket sessions do not run in Vercel Functions. The Node authority is packaged by `Dockerfile.authority`; `render.yaml` is the reference low-cost deployment with a persistent 1 GB disk. The file identity repository is intentionally narrow and can later be replaced by the Session 5 PostgreSQL adapter.

The persisted JSON contains player ID, locked callsign, SHA-256 credential verifier, assigned ship ID, spawn slot and the minimum ship snapshot. The bearer credential exists only in the registering browser's local storage and is never written to the repository or UI. This prototype has no password recovery; clearing browser storage loses access until an operator recovery tool exists.

## Environment

Backend:

- `HOST=0.0.0.0`
- `PORT=8787`
- `IDENTITY_STORE_PATH=/data/identities.json` on a mounted persistent disk
- `ALLOWED_ORIGINS=https://<vercel-project>.vercel.app` (comma-separated for multiple exact origins)

Frontend build:

- `VITE_GAME_SERVER_URL=wss://<authority-host>`

Local development needs no environment changes. Vite proxies `/socket` to `127.0.0.1:8787` and identities go to `.data/identities.json`.

## Manual deployment

1. Create the backend from `render.yaml` (or deploy `Dockerfile.authority` to an equivalent service with a persistent `/data` volume).
2. Set `ALLOWED_ORIGINS` to the final Vercel HTTPS origin and deploy the authority. Confirm `https://<authority-host>/health` reports `file-identity`.
3. Import this repository into Vercel, keep the repository root, and set `VITE_GAME_SERVER_URL` to the backend `wss://` origin.
4. Deploy the Vercel project. If Vercel assigns a different production hostname, update `ALLOWED_ORIGINS` and redeploy the backend.
5. Open the public URL in two independent browser profiles, register two callsigns, verify both markers and OPS presence, move each ship, then refresh both browsers and confirm stable ship IDs.

No paid resource or public deployment is created automatically by this repository change.
