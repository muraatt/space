# Canonical Repair Pass 3 — Maneuver / Station / Physics

Scope: repair CAN-007, CAN-008, CAN-015, CAN-024, and CAN-030 without changing the accepted two-body fidelity, shared-world ownership model, mission/economy behavior, or UI design. Starting HEAD remained `daec4e53bb78e2745d307a46b582c8f86a2b65b7`; the uncommitted Pass 1/2 repair tree was preserved. Pass 4 was not started.

## CAN-007 — plan binding and station completion

- Root cause: a connection plan stored only planner output and target ID. Execution did not bind active ship, ECI state epoch, mass/fuel, propulsion capability, or target state. Station completion then unconditionally replaced the final state with a point 200 m from Alpha.
- Fix: each plan now carries a 30-second authoritative fingerprint covering active/physical ship ID, ECI position/velocity and simulation epoch, all mass components, main/translation thrust, Isp, target identity/state, and target epoch. Natural propagation is accepted within the configured scheduling envelope; material change returns `REPLAN_REQUIRED`. A selected candidate is refreshed at the validated execution epoch. No execution or fuel use begins before both checks pass.
- Station fix: the planner receives the live 200 m approach state. Completion measures the real final state against the current port approach state, requires ≤300 m position error, ≤5 m/s station-relative speed, and non-negative approach-axis distance, and records `stationHandoffCorrectionM`. The compatibility correction is applied only after this gate and is capped at 300 m. Failure leaves position unchanged and reports `STATION_HANDOFF_TOLERANCE_NOT_MET`.
- Regression: manual 201 m position, 2.01 m/s velocity, fuel, engine performance, replacement ID, active-ship swap, 5.001 km target-state change, and expiry are rejected. The network test displaces the ship 860 km after planning and receives `REPLAN_REQUIRED` with unchanged fuel and no maneuver. A direct zero-burn station completion at the same displacement fails without rebase.
- Numerical result: valid FAST station handoff correction was 167.941943 m (300 m cap), final manual-approach range 200 m and relative speed 0 m/s. The 860 km case applied 0 m correction.
- Status: fixed.

## CAN-008 — execution-faithful local rendezvous

- Root cause: local shooting solved an instantaneous departure coast, then only used finite burns for fuel/duration; verification algebraically applied an arrival vector to the impulse trajectory. The executor instead flew finite departure and arrival burns.
- Fix: every shooting/Jacobian sample now flies the finite departure burn, coasts only the remaining interval, tracks target velocity at each arrival-burn micro-step, flies the finite arrival burn, and compares the resulting state with the target propagated to the identical final epoch. `MATCH_TARGET_VELOCITY` execution uses the same time-varying target velocity contract.
- Regression and numerical result:

| Offset | Reported position | Actual position | Reported velocity | Actual velocity |
|---:|---:|---:|---:|---:|
| +20 km | 0.000017 m | 0.000078 m | 0.000359 m/s | 0.000359 m/s |
| +50 km | 0.000084 m | 0.000626 m | 0.005248 m/s | 0.005248 m/s |
| +90 km | 0.000090 m | 0.000873 m | 0.028139 m/s | 0.028138 m/s |

All actual velocity errors are below the existing 5 m/s contract; verification-to-execution velocity disagreement is below 0.001 m/s.
- Status: fixed.

## CAN-015 — normal-motion AEGIS contact

- Root cause: body contact existed only inside explicit capture rejection, so ordinary physics could cross the 45 m station body without damage.
- Fix: every authoritative motion tick performs a swept relative segment/sphere test. Contact is resolved 0.5 m outside the body, inward velocity is damped/reflected, ≥5 m/s first contact enters the existing damage/module/cooldown path, and an active maneuver fails with `STATION_COLLISION`. A contact latch plus the existing five-second cooldown prevents repeated damage loops. Capture remains a separate command-gated volume and never auto-docks.
- Regression: a 12 km/s center crossing cannot tunnel and produces one bounded hard impact; 120 subsequent ticks remain finite without repeat damage. A high-speed pass through the capture volume at body-safe radius does not dock or damage, a 46 m body near miss stays clear, and the existing low-speed docking test still passes.
- Status: fixed.

## CAN-024 — planner fairness and recovery

- Root cause: all callers posted directly to one worker, one player could build an unbounded FIFO, errors permanently poisoned the service, and outer gateway handling mislabeled planner failures as invalid JSON. Per-connection plan maps were unbounded.
- Fix: the service permits two active/queued requests per owner, caps the global queued set at 32, alternates owners when choosing the next request, times out work at five seconds, and returns specific `PLANNER_BUSY`, `PLANNER_QUEUE_FULL`, `PLANNER_TIMEOUT`, `PLANNER_WORKER_FAILED`, `PLANNER_FAILED`, or `PLANNER_CLOSED` errors. Worker error/exit/post failure rejects the affected active request, starts a replacement worker, and continues queued work. Mission planning is sequential so the same per-owner boundary applies. Connection plan storage is capped at 16 with 30-second TTL for live entries and consumed receipts.
- Regression: A floods to its cap while B is dispatched before A's backlog; synthetic worker crash rejects A and the replacement completes B plus a later request; a stuck request times out and leaves zero pending entries; plan-store capacity and TTL cleanup are covered.
- Performance: Windows/Node local worker, three 400→800 km requests: A1 635.935 ms, B1 941.805 ms, A2 1246.134 ms. B completed before A2 under contention.
- Status: fixed.

## CAN-030 — exact terminal burn step

- Root cause: execution always applied a full `1/60 s` step before checking elapsed duration, yielding `ceil(duration/dt)` and thrusting once for zero duration.
- Fix: execution first computes remaining duration, skips zero, and calls the existing pure `step(world, dt)` with `min(1/60 s, remaining)`. Coast anchors and completion timestamps use the exact planned burn endpoint.
- Regression: zero duration produces zero simulation/fuel steps; `2 × dt` produces exactly two; `2.4 × dt` produces two full plus one 0.4 partial step. Executor mass is compared with planner `propulsionStep` output.
- Numerical result: for the 0.04 s partial case, planner and executor both apply 960 N·s and consume 0.305914864 kg; test agreement is within 1e-6 N·s and 1e-10 kg.
- Status: fixed.

## Verification and performance

- `pnpm check`: passed.
- Full unit/integration suite: 28 files, 158 tests passed.
- Server integration suite: 19 files, 105 tests passed.
- Focused Pass 3 suite: 8 files, 38 tests passed before the final network/handoff additions; all additions pass in the final full suite.
- Production build: passed, Vite 163 modules; client bundle 1,246.64 kB (353.46 kB gzip), unchanged deferred bundle-splitting concern.
- Browser journeys: maneuver journey (including low fuel) passed; shared-identity journey passed in Chrome/WebGL2 at 1920×1080 with two independent contexts; station journey's full target/plan/coast/manual keyboard capture/service/undock test passed in 1.6 minutes. On this Windows host Playwright printed the station success line and closed both listeners but its parent teardown did not exit, so the already-completed runner was interrupted; no assertion was skipped or relabeled.
- Visual inspection: the current registration, two-player HUD, and offline-hidden 1920×1080 Chrome/WebGL2 captures were inspected once. The registration gate is centered/readable, both-player HUD is intact, and offline tactical presence is absent as intended; no unexpected visual regression was found.
- Small-player tick measurement with swept station check: 10,000 Windows/Node headless ticks, 357.627 ms total, 0.035763 ms average, 0.0363 ms p95, 0.1129 ms p99. No GPU claim is made.
- `git diff --check`: passed after documentation.

## Remaining blockers

- No Pass 3 correctness blocker remains.
- The Playwright parent-process teardown hang on this Windows runner remains a tooling/process-cleanup issue; the individual station assertion completed successfully and ports were confirmed closed.
- Subjective human flight feel, reference-GPU performance, and findings assigned to Repair Pass 4 remain unverified and out of scope.
