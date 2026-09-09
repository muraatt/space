# Canonical Repair Pass 2 — State / Multiplayer / Mission

Scope: repair the Phase-0 identity checkpoint, current multiplayer presence/runtime, and existing local mission/economy invariants. This pass does not begin Pass 3 station/maneuver physics work and does not make missions, NPCs, combat, or economy shared between pilots.

## CAN-003 — one authoritative active ship identity

- Root cause: recovery IDs came from a per-world sequence, while `IdentityRecord.shipId` and the database `ship_id` retained the starter ID.
- Minimal fix: replacement IDs use UUIDs; one repository write atomically updates `ship_id`, `ship_state`, and the Phase-0 checkpoint. Runtime identity, public snapshots, and the client identity follow `WorldState.ship.id`.
- Regression: two pilots recover concurrently, reconstruct through both adapters, retain distinct replacement IDs, and cannot assign the same ship to two identities.
- Status: fixed.

## CAN-004 — coherent persisted lifecycle

- Root cause: only `ShipState` was saved; module damage, wreck, and recovery status were reconstructed as a healthy combat state.
- Minimal fix: a versioned Phase-0 checkpoint stores the active ship's module conditions, recovery record, and bounded wreck history. The restore boundary validates lifecycle combinations and fails closed on invalid data.
- Regression: healthy, damaged, destroyed/recovery-required, and recovered matrices run against file and real PostgreSQL adapters.
- Status: fixed.

## CAN-005 — fatal mission loss

- Root cause: fatal loss only failed the active interception/bounty helper, leaving cargo and reconnaissance attempts completable.
- Minimal fix: destruction fails every accepted/active mission family, stops scanning, removes physical cargo, clears the active attempt, and all completion entry points reject destroyed ships.
- Regression: cargo, reconnaissance, interception, and bounty each fail without reward after fatal damage.
- Status: fixed.

## CAN-006 — failed mission re-offer

- Root cause: one ID represented both the offer template and attempt history, so a failed ID permanently filtered its own template.
- Minimal fix: `templateId` is separate from a UUID attempt ID. Failed attempts remain bounded history and may be re-offered; completed template IDs are durable and remain consumed.
- Regression: forty fail/recover/re-offer cycles for every mission family produce unique attempts, no reward, and bounded history.
- Status: fixed.

## CAN-009 — common AEGIS epoch

- Root cause: each pilot's private `World` aged its station from its own creation time while remote ships used absolute ECI state.
- Minimal fix: shared mode derives AEGIS from one configured epoch and one authority clock immediately before simulation/snapshot publication. Per-pilot missions and combat remain private.
- Regression: a delayed join and reconstructed sandbox report zero station-position discrepancy in the deterministic clock test.
- Status: fixed for current Phase 0.

## CAN-013 — economy restart consistency

- Root cause: durable ship value was saved while credits, reputation, and faction selection reset.
- Minimal fix: credits and the directly dependent Phase-0 state share the same atomic identity-row/file write as the active ship. Durable gateway operations do not acknowledge or publish a snapshot while that write is pending; an uncertain commit closes the session and requires authoritative reload.
- Regression: upgrade, ammunition, and fuel purchases retain both charged credits and ship value through adapter reconstruction; fault injection proves no early success acknowledgement.
- Status: fixed.

## CAN-014 — single hull truth

- Root cause: `combat.playerHull` initialized/reset to 100 independently of `ship.conditionPercent`.
- Minimal fix: `ShipState.conditionPercent` is canonical; combat hull is derived on initialization, selection, restore, repair, recovery, and subsequent damage.
- Regression: a restored 20% hull takes five damage to become 15%, and every lifecycle state asserts hull/condition equality.
- Status: fixed.

## CAN-016 — identity adapter parity

- Root cause: the file adapter allowed credential reuse, used array length as the spawn slot, serialized only per object instance, and did not update the current ship ID.
- Minimal fix: file and PostgreSQL adapters both enforce unique normalized callsign, credential verifier, spawn slot, and ship ID; allocate `MAX(spawn_slot)+1`; and atomically save current ship identity plus checkpoint. File access is serialized per resolved path.
- Regression: one shared contract suite covers concurrent idempotent registration, collision behavior, gapped spawn allocation, lifecycle, recovery, purchased value, and restart. It passed against the file adapter and a real isolated PostgreSQL instance.
- Status: fixed.

## CAN-019 — durable economic idempotency

- Root cause: the only transaction receipt list discarded its oldest entry after 256 operations and was not persisted.
- Minimal fix: identity-lifetime economic receipts are stored in the Phase-0 checkpoint; transient flight/combat command rings remain short-lived and are not added to durable storage.
- Regression: after 270 newer fuel operations and authority reconstruction, replaying the oldest purchase is still rejected without charging or applying value.
- Status: fixed.

## CAN-021 — registration abuse and runtime lifecycle

- Root cause: unauthenticated registration had only the general message-rate limit, and every disconnected pilot `World` stayed resident forever.
- Minimal fix: at most three registration attempts per socket and ten attempts per source per ten minutes; the source table is capped at 1,024. Forwarded client addresses are trusted only with explicit `TRUST_PROXY=1` (the Render Blueprint sets it). Offline runtimes have a 60-second grace and are evicted only after a successful durable save.
- Regression: peer cooldown/table bounds, gateway reconnect budget, fifty historical runtimes, save-failure retention, eviction, and reconstruction are covered.
- Status: fixed for closed alpha.

## CAN-022 — spawn/planner compatibility

- Root cause: spawn offsets used the ECI Y axis and placed most slots outside the planner's supported orbital plane.
- Minimal fix: offsets use the station radial/prograde basis and receive coplanar circular velocity. Planner geometry is unchanged.
- Regression: every slot from 0 through 40 remains coplanar and yields at least one viable AEGIS rendezvous candidate.
- Status: fixed.

## CAN-023 — insurance value invariant

- Root cause: every replacement received the definition's initial propellant, so deliberate destruction could be a free refuel.
- Minimal fix: recovery records the remaining propellant and replacement fuel is capped at that amount; ammunition, cargo, and upgrades are not restored. Existing Raptor deductible/fallback behavior remains.
- Regression: a low-fuel Kestrel receives no propellant, ammunition, or credit gain through self-destruction/recovery.
- Status: fixed.

## CAN-025 — snapshot fan-out

- Root cause: every snapshot built remote state from every runtime ever created, including offline history, producing all-history quadratic work.
- Minimal fix: fan-out is built only from currently connected/non-persisting pilots; offline history is omitted and later evicted.
- Regression: with fifty historical identities and two connected pilots, each connected pilot receives exactly one remote and historical runtimes receive no fan-out.
- Status: fixed for Phase-0 scale.

## CAN-028 — truthful offline presence

- Root cause: 3D hid offline ships, but the orbital map and OPS list still rendered frozen spatial state and range.
- Minimal fix: one `livePlayers` policy filters spatial presence in 3D, map, and OPS. Offline callsigns are not rendered as live tactical positions.
- Regression: server fan-out, React-rendered map/OPS, Three.js visual count, and the two-context browser journey verify the same policy.
- Status: fixed.

## Verification

- `pnpm check`: passed.
- Full standard application suite: 25 files, 138 tests passed, including the file-side adapter contract.
- Server integration suite: 16 files, 85 tests passed.
- Real PostgreSQL adapter contract: 14 tests passed across file and PostgreSQL variants. Re-run with `TEST_DATABASE_URL` pointing to an isolated disposable database.
- Shared browser journey: Chrome, WebGL2, 1440×900, two independent contexts; passed in 34.1 seconds with distinct ships, bidirectional movement, ownership rejection, refresh restore, no duplicate starter, and offline spatial hiding.
- Screenshots inspected: registration gate, two-player HUD, and offline-hidden HUD under `.runs/playwright/shared-identity`.
- Production build: passed. This build reports a 1,246.22 kB client JS chunk (353.33 kB gzip); bundle splitting is deferred and not a Phase-0 correctness blocker.
- `git diff --check`: passed.

## Intentionally deferred Phase-0 limitations

Missions, NPC/contact state, combat, and economy remain local per player; there is no PvP, squad, chat, shared mission state, or remote interpolation. Flight-state saves remain periodic outside explicitly durable economic/identity operations. Pass 3 maneuver/station physics findings are untouched.
