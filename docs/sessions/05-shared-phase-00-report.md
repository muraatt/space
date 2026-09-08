# Shared orbital sandbox — Phase 0 report

## Scope

This pass adds the smallest identity and two-pilot shared-world foundation. Passwords, email, OAuth, account recovery, squads, shared missions, chat, PostgreSQL and full Session 5 persistence remain outside the pass.

## Architecture and authority

`SharedSandbox` owns all connected pilot runtimes under one server clock. Each socket is authenticated to one opaque `playerId`; gameplay commands continue through the existing runtime schema and dispatch ownership check against that identity's assigned ship. Every pilot snapshot includes the other authoritative player ships and presence. A client cannot select its player ID or callsign during gameplay.

`FileIdentityRepository` serializes username reservation and atomic JSON replacement. Callsigns are trimmed, 3–20 characters, restricted to ASCII letters, numbers, space, underscore and hyphen, and unique after lower-case normalization. The locked callsign maps to a UUID player ID. A 256-bit browser credential is represented on disk only by its SHA-256 verifier.

Registration creates exactly one existing Raptor starter configuration with a stable generated ship ID. Deterministic eight-slot rings around AEGIS prevent coincident free-flight spawns. The server issues the 256-bit credential before registration; a replay carrying the same callsign and credential resolves to the same record and ship. Refresh and reconnect restore the credential, player ID and ship. The backend snapshots ships every five seconds and flushes them at clean shutdown.

## UI and shared visibility

First entry presents one callsign field. Normal UI exposes the callsign as locked identity. Remote ships use the existing editable ship model in the Three.js near scene, with a cyan callsign plate. The orbital map and OPS panel show remote callsign, presence and range.

## Deployment boundary

Vercel hosts the static client. A long-lived container hosts the continuous authoritative loop and WebSocket gateway; a mounted disk backs the prototype identity file. See [deployment instructions](../deployment_shared_sandbox.md). A public URL still requires the user's Vercel/backend accounts and final origins.

## Verification

Verification on 2026-09-08:

- `pnpm check`: passed.
- `pnpm test:unit`: 19 files, 98 tests passed.
- targeted identity/protocol/client set: 24 tests passed.
- `pnpm build`: passed; Vite production client emitted successfully.
- two-independent-context Playwright acceptance: 1 passed. IDs and ship IDs differed; each snapshot contained the other ship; movement propagated in both directions; forged foreign thrust returned `NOT_OWNER`; refresh restored the same ship without duplication and did not disturb player B.
- existing input/UI/reclaim regression: 4 passed.
- Chrome/Playwright, 1440×900, WebGL2 shared capture: 15 draw calls, 54,454 triangles, 31.51 ms sampled average frame interval, 7.5 ms local RTT. This software/test-host measurement is not reference-GPU performance.
- two screenshots inspected once: registration and shared HUD. No blocking overlap, unreadable identity state or missing remote map/OPS indication was found.

Evidence is in `artifacts/shared-phase-00`. Playwright's Windows web-server wrapper left the already-finished 5174/8788 child processes open after reporting assertions; the isolated listener PIDs were stopped and Playwright then returned exit code 0. This is a test-harness cleanup issue, not a game-server assertion failure.

## Deferred

Passwords/authentication hardening, recovery, full game persistence, shared mission state, squad, chat, combat between players, interpolation/lag compensation, scale/load work and PostgreSQL belong to later Session 5 passes.
