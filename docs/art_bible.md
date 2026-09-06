# Art bible — Session 1

Visual identity: ORBITAL / Earth Operations. Near-future industrial spacecraft with ceramic panels, exposed graphite structure, cylindrical pressure tanks, restrained copper markings and dark radiator fins. The first vehicle is a 12 m service tug, not a fighter. Empty docking nose, four main engine bells aft, external tanks, small antenna and physically scaled details make direction legible.

Before-code reference: assets/source/art-direction.svg. It specifies day composition, night exposure, vehicle silhouette, mission-control typography and the later combat-feedback direction. Combat is reference-only in Session 1.

Palette: near-black #070c12, pale text #e3edf0, muted slate #80949e, ice blue #87dce8, controlled amber #dca865. Typography: locally available Segoe UI for Turkish interface, Consolas for telemetry. No remote fonts.

Earth uses the NASA Blue Marble 8K land/ocean/ice map (G57730), Solar System Scope 8K city lights and 2K clouds. Sources, license links and hashes are recorded in assets/manifest.json. Sun is a directional light. Earth shadow is calculated analytically for nearby craft. A modest explicit cinematic fill keeps the hull legible in eclipse; it is an art choice, not simulated sunlight. Atmosphere is a single continuous optical limb with tangent-altitude falloff, not volumetric weather.

Camera: perspective third-person, orbit drag, wheel dolly, recover view button. The Earth must remain at its true angular scale from 400 km altitude. Exposure is fixed by the named scene, never changed by frame rate. Stars remain restrained.

One metre in source equals one simulation/render-local metre. Body axes: +X right, +Y up, -Z forward. Rendering converts ECI to a moving orbital basis, subtracting the camera origin in double precision before upload. Ship components share four PBR materials. Editable source is starter-ship.recipe.json and procedural meshes; Blender source completion belongs to Session 3.

Session 1 acceptance: Earth limb, day/night transition, readable silhouette in eclipse, consistent panels, no missing textures, no HUD overflow. Initial whole-frame draw budget <=150. Final slice budgets: <=250 calls and <=1M triangles at medium. Reference-GPU 60 FPS remains a measured target, not an assumption.

Session 3: two editable ships and LOD source. Session 6: detailed surface finish, audio, effects, final LOD/texture optimization and quality settings.
