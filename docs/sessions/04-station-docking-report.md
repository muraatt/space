# Orbital sandbox phase 1 — station, rendezvous and manual docking

## Delivered loop

The local authoritative world now contains one stable `aegis-service-01` entity in a 450 km circular equatorial ECI orbit. Alpha is its only port. The player can select AEGIS, compare the existing Economic/Balanced/Fast maneuver candidates, execute the chosen server-held plan, take over at a 200 m approach handoff, fly the last segment manually, request capture, use the existing station services and undock into normal flight.

The station uses a procedural, editable Three.js model and a separate orbital-map marker/path. Port rings, approach axis and capture indication are camera-relative. No external asset was added.

## Authority and state

Shared runtime contracts add the station, port, docking metrics and `NONE`, `RENDEZVOUS`, `APPROACH`, `FINAL_APPROACH`, `DOCKED` phases. The client sends only station/port/action identifiers. The server resolves the moving rendezvous target, owns phase transitions, validates capture geometry and blocks duplicate docking commands. Timestamped coast propagation advances both ship and station; on arrival the stored 200 m relative handoff is applied to the station's current propagated port.

Capture requires the configured range, relative/closing speed, lateral, forward-axis and roll limits. A capture-zone impact at 5 m/s or more enters the existing authoritative damage path. Docking retains the same ship entity and attaches it to the port. Translation, rotation and weapons are rejected while docked. Existing fuel, repair, ammunition, ship-selection and upgrade transactions require the correct docked station and keep their existing idempotency and server prices. Undock places the ship 14 m along the port axis with 0.5 m/s separation velocity.

## UI and scenarios

The orbital map shows AEGIS and its orbit. The normal HUD adds a contextual DOCKING block and a compact central guidance cue. OPS exposes station selection, capture, services and undock without adding another full-screen system. Hangar and service controls clearly state and enforce docking availability.

`station_rendezvous` starts 4 km from Alpha for planner/rendezvous verification. `station_docking` starts 8 m from Alpha with matched velocity for final-approach and capture checks. Test HTTP support remains token-protected, test-mode-only and loopback-bound; its coast-event advance only samples the normal timestamped authoritative maneuver state.

## Verification

- Static/type/lint check: passed.
- Station/protocol authority tests: 23 passed.
- Station UI journey: passed. It used the real target, planner, execute and keyboard control paths; only the multi-minute coast timestamp was advanced through the isolated test server.
- Hangar regression journey: passed.
- Full unit/integration suite and production build: 92/92 tests passed; Vite production build passed.
- Existing flight, input/focus, maneuver, mission, combat, loss/recovery and HUD journeys: all 19 unique checks passed. One combat-loop check initially hit a UI cooldown race in its test code; its enable-check/click was made atomic and both combat journeys then passed.
- Visual pass: four 1920×1080 Chrome/WebGL2 captures inspected once; no blocking clipping, unreadable controls or missing state was found. Evidence: `artifacts/station-phase-01`.
- Three-second headless software/WebGL2 approach sample: 106 frames, 29.02 ms average, 41.70 ms p95, 26 draw calls, 55,634 triangles; RTT 10.8 ms; server tick 0.78 ms, p95 0.82 ms, p99 1.07 ms. This is automation-host software rendering and is not a reference GPU result.

## Known gaps and entrance gate

Subjective human flight feel and target GTX 1060/1660 or RTX 2060 measurements remain unverified. Close approach uses simple visual rings and has no contact dynamics beyond validated capture/hard-impact damage. Additional stations, station roles, economy tuning, bounty expansion, docking art/audio polish and multiplayer remain deferred.

The repository gate for the bounty orbital sandbox pass is green. Subjective manual approach feel remains for the user's live-site playtest and does not block the implemented authority/test gate.
