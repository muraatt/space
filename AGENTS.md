# ORBITAL / Production rules

Current milestone: shared orbital sandbox Phase 0, minimal identity and two-player shared-world acceptance. Sessions 1–4, AEGIS docking and bounty loop remain accepted prerequisites.

- Read README, docs/roadmap.md, docs/vertical_slice.md and the latest session report before work.
- State the session scope briefly, then implement, integrate, run tests, inspect screenshots and update documentation in the same session.
- Preserve Sessions 1–4, AEGIS and bounty behavior. Phase 0 adds only a locked callsign, opaque player identity, one authoritative starter ship, durable minimal identity and two-player shared presence. Do not add passwords, email, OAuth, squads, chat, PostgreSQL, shared missions, extra stations, loot or new weapon/economy systems.
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
