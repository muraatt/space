export const CONFIG = Object.freeze({
  protocolVersion: 1 as const,
  universeId: 'local-earth-01',
  shipId: 'kestrel-01',
  earthRadius: 6378137,
  earthMu: 3.986004418e14,
  initialAltitude: 400000,
  epochMs: Date.UTC(2026, 8, 6, 12),
  fixedDt: 1 / 60,
  snapshotHz: 20,
  inputHz: 20,
  inputTimeoutMs: 250,
  massKg: 8000,
  mainThrustN: 24000,
  translationThrustN: 8000,
  angularRate: 0.35,
  angularAcceleration: 0.65,
  port: 8787,
  maxPayloadBytes: 4096,
  maxCommandsPerSecond: 100,
});
export const SCENES = ['orbit_day', 'orbit_night'] as const;
export type SceneId = (typeof SCENES)[number];
