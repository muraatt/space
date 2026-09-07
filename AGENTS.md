# ORBITAL / Production rules

Current milestone: Session 3, economy/hangar completion and final acceptance. Sessions 1 and 2 were accepted by the user.

- Read README, docs/roadmap.md, docs/vertical_slice.md and the latest session report before work.
- State the session scope briefly, then implement, integrate, run tests, inspect screenshots and update documentation in the same session.
- Session 3 now includes two factions, a local authoritative profile, cargo/reconnaissance/non-combat interception, a two-ship hangar, fuel/repair/ammunition services and four fixed upgrades. Do not add weapons, combat damage, insurance, accounts, database integration or Session 4 systems during final acceptance.
- Use the local Node authoritative command path from the beginning. Never make client transforms authoritative.
- simulation is pure TypeScript: no Three.js, React, network, database or wall clock imports. Time, commands and randomness are injected. SI units and ECI coordinates are canonical.
- shared owns runtime schemas, units and versioned configuration. Documents link to definitions instead of duplicating tunable values.
- The browser UI is React DOM; the render loop owns the Three.js canvas independently.
- Test functional behavior and trust boundaries. Use real keyboard/mouse controls in journeys. Read-only debug state supports assertions, not bypasses.
- Test hooks require an explicit test server and a loopback-bound isolated world. Never enable them on a public service.
- Run check, unit/integration tests, journeys and visual inspection for the current session. Report command results honestly. A skipped test is not a pass.
- Label GPU/backend/browser/viewport and measurement duration. Software rendering is not reference-GPU performance.
- Keep assets editable/reproducible. Record third-party URL, author, license and SHA-256.
- Never overwrite visual baselines without inspecting the change. Keep evidence under artifacts/session-01.
- Record known gaps and the next milestone entrance gate. Human subjective playtest and unavailable hardware measurements must remain unverified.
- No proactive sub-agent delegation. Preserve the six-session structure.
