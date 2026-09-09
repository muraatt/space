# Canonical Repair Pass 1 — Adjudication + Identity/Process Safety

## Baseline

- Canonical audit commit: `daec4e53bb78e2745d307a46b582c8f86a2b65b7`.
- Repair starting HEAD: `daec4e53bb78e2745d307a46b582c8f86a2b65b7` (exact match; no intervening source changes).
- Scope stopped before Wave 2. Planner, mission, economy, and shared-world architecture semantics were not repaired in this pass.

## Adjudications

### ADJ-001 / CAN-008 — CONFIRMED

Initial Kestrel, same-phase `NEAR_RENDEZVOUS_STATE`, FAST candidate, no station/entity handoff. The actual executor was run independently and the target was propagated to the executor's completion epoch.

| Offset | Planner position error | Planner velocity error | Actual position error | Actual velocity error |
|---:|---:|---:|---:|---:|
| +20 km | 0.224318163 m | 0 m/s | 259.134818016 m | 8.323619898 m/s |
| +50 km | 1.365219559 m | 0 m/s | 1,738.221677346 m | 20.425461462 m/s |
| +90 km | 0.000001585 m | 0 m/s | 5,719.541307138 m | 36.004962202 m/s |

All three actual velocity errors exceed the 5 m/s contract while planner verification reports zero. No planner fix was made in Pass 1.

### ADJ-002 / CAN-009 — CURRENT CORRECTNESS BUG

After A's world advanced deterministically for 30 seconds and A was placed at A-local AEGIS, B joined with a fresh local world:

- remote A → A-local AEGIS: `0 m`
- remote A → B-local AEGIS: `229,202.124001596 m`
- A-local AEGIS → B-local AEGIS: `229,202.124001596 m`

This is a player-visible contradiction in the accepted shared-world presentation, not merely an invisible Phase-0 implementation detail. No shared-world redesign was made in Pass 1.

### ADJ-003 / CAN-005 + CAN-006 — frozen mission semantics

| Type | Current result after fatal destruction | Objective/reward after loss | Same base offer returns | Finite fixed-ID pool exhaustible |
|---|---|---|---|---|
| Cargo | remains active, then becomes `COMPLETED` | yes / yes | no | yes |
| Reconnaissance | remains active, then becomes `COMPLETED` | yes / yes | no | yes |
| Interception | `FAILED` | no / no | no | yes |
| Bounty | `FAILED` | no / no | no | yes |

Frozen later-pass expectation: fatal destruction fails every active mission, post-loss objectives cannot pay, failed/abandoned base offers may be generated again, and repeated failure must not permanently exhaust the offer pool. Mission code was intentionally not changed here.

## Fixed findings

- CAN-020: authority Playwright probes now register/resume through the production identity contract before asserting strict schema rejection, `NOT_OWNER`, replacement, and delayed-old-socket rejection.
- CAN-029: Vitest and Playwright runtime output now goes under ignored `.runs/`; shared-identity evidence is promoted to tracked artifacts only with `UPDATE_ACCEPTED_EVIDENCE=1`.
- CAN-012: unexpected repository errors produce retryable `IDENTITY_UNAVAILABLE`; only actual invalid credentials are deleted. The client preserves the bearer credential and reconnects/resumes later.
- CAN-010: background saves are serialized, caught, reported, retained as dirty on failure, and retried by later flushes without an unhandled rejection.
- CAN-011: persisted Phase-0 ship state is validated before world creation. Invalid mass/state/performance coherence raises an identity-scoped `IDENTITY_RESTORE_INVALID` response while other worlds continue.
- CAN-001: gameplay dispatch verifies the socket is still the current player binding. Replacement updates that binding before transport close, so the old socket loses authority synchronously.
- CAN-002: per-socket authentication is serialized, post-await state is rechecked, and runtime attach/detach is idempotent.
- CAN-017: startup rejects `TEST_MODE=1` for wildcard, public-interface, or public-host bindings; intended loopback hosts remain allowed.

## Regression gate

- `pnpm check`: passed.
- Full unit suite: 22 files, 118 tests passed.
- Server integration suite: 14 files, 67 tests passed.
- Focused adjudication/identity/process suite: 5 files, 26 tests passed.
- Authority Playwright: 3 tests passed through authenticated identity flow.
- Shared-identity Chrome/Playwright journey: 1 test passed at 1440×900, WebGL2; registration and shared HUD captures inspected with no unexpected visual regression.
- Production build: passed (Vite, 162 modules).
- `git diff --check`: passed.
- Artifact hygiene: full unit/integration and journey runs added no tracked evidence changes; only intentional repair files remain modified.

## Known gaps retained for later passes

- CAN-008 planner verification remains confirmed and unfixed.
- CAN-009 common-world/AEGIS epoch correctness remains confirmed and unfixed.
- CAN-005/CAN-006 mission loss/re-offer behavior remains confirmed and unfixed.
- No other Wave 2+ finding is marked fixed by this report.
