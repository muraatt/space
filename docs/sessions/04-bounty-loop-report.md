# Orbital sandbox phase 2 — bounty hunting and repeatable loop

## Delivered loop

The local authoritative sandbox now starts docked at AEGIS in `bounty_sandbox`. The existing Contracts screen offers three stable live targets: low-risk SCOUT `ROGUE S-09`, medium FIGHTER `ROGUE F-17`, and high-risk HEAVY `ROGUE H-31`. The player can accept one while docked, undock, transfer the entity reference into the maneuver computer, fly an authoritative intercept, acquire and fight the assigned target, receive one reward, target AEGIS, execute a return rendezvous, manually capture, use existing services and accept a second bounty without reload, server restart or world reset.

Rewards are 1,800/3,200/4,800 integer credits with 5/10/16 reputation. Each accepted contract records authoritative starting fuel, ammunition and condition. Completion reports gross reward, fuel and ammunition consumed, damage, existing service-price operating cost and net result. The values are initial test balance stored in shared configuration.

## Orbital targets and planning

All three targets are real server-owned combat entities with stable IDs, ECI position/velocity, circular state, class/threat metadata, health and destroyed state. Normal ticks and timestamped coasts propagate live contacts. Destroyed contacts remain as bounded world history, become ineligible, disappear from future bounty generation and cannot reward again.

The pure TypeScript planner now handles close same-plane rendezvous with deterministic two-burn shooting candidates. It predicts the target at 10, 15 and 20 minutes, solves the required inertial departure vector through Kepler propagation, prices both burns through the existing mass/propellant model and verifies the intercept. The client sends only an entity or station ID. The gateway resolves the live state and stores the candidate; execution consumes that stored plan. The combat handoff is 1.2 km and still requires acquisition and weapons. Station planning uses the orbital center snapshot, then the existing completion handoff rebases to the live Alpha port; there is no return or docking teleport.

## Combat and authority

SCOUT deterministically evades, FIGHTER alternates attack/reposition decisions and HEAVY attacks with greater durability and damage. Existing laser, missile, countermeasure, module-damage, destruction and recovery rules are reused. In NORMAL space, fire requires the active bounty, the exact assigned target and completed acquisition. The server alone owns target propagation, eligibility, damage, destruction, completion, reward and service prices. Stable command/transaction IDs retain duplicate protection. Player destruction fails the active bounty and pays nothing.

## UI and visual verification

Contracts cards show target, class, threat, altitude, planner-derived ETA/Δv/fuel and fixed reward. OPS shows the active bounty, real range and authorization state. The map follows the target's actual osculating orbit. Fire Control labels class/threat. The result card shows authoritative operating cost and net credits and offers a target-only AEGIS shortcut.

Four 1920×1080 Chrome/WebGL2 captures under `artifacts/bounty-phase-02` were inspected once: bounty board, active hunt, acquired target and reward result. No blocking clipping, unreadable contract data or missing state was found. The close station view immediately after undock is visually busy but remains operable.

## Verification and performance

The final recorded verification passed: static/type checks; 95/95 unit and integration tests across 18 files; Vite production build; the primary bounty journey in 2.0 minutes; and 24/24 existing real-browser regression checks in 4.8 minutes. The primary journey uses only player-facing UI and real keyboard control; the loopback/token-protected test service advances the two long coast timestamps, while acceptance, targeting, planning, execution, acquisition, fire, reward, station selection, manual approach, capture, service and second acceptance all use normal command paths.

The inspected three-second 1920×1080 Chromium/WebGL2 automation sample with three live bounty contacts recorded 101 frames, 30.53 ms average, 41.70 ms p95, 27 draw calls and 56,018 triangles. RTT was 14.2 ms; server tick was 0.85 ms current, 0.93 ms p95 and 1.20 ms p99. This is headless automation-host software rendering and is not a reference GPU measurement.

## Known gaps and playtest gate

Human flight/combat feel, target GTX 1060/1660/RTX 2060 performance and final economy balance remain unverified. The automated run proves one complete bounty plus acceptance of a second; it does not play the second fight to completion because the same authority paths are already covered. Manual-flight efficiency rewards, additional stations, more bot variety, loot/salvage, multiplayer and broader world expansion remain deferred.

The technical gate is green only when the final recorded check, unit suite, build and relevant journey regression pass. The remaining gate is the user's live sandbox playtest at `?scene=bounty_sandbox`.
