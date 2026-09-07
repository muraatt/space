import { describe, expect, it } from 'vitest';
import type { ManeuverPlanResult } from '@orbital/shared';
import { generateMissionPool } from './generator';

const reachable = (etaSeconds: number): ManeuverPlanResult => ({
  version: 1,
  candidates: [
    {
      type: 'ECONOMIC',
      estimatedDeltaVMps: 10,
      estimatedPropellantKg: 20,
      waitSeconds: 0,
      transferDurationSeconds: etaSeconds,
      etaSeconds,
      burns: [],
      expectedFinalState: { position: [1, 0, 0], velocity: [0, 1, 0] },
      expectedFinalMass: { dryKg: 1, modulesKg: 0, cargoKg: 0, ammunitionKg: 0, propellantKg: 1 },
      expectedReserveDeltaVMps: 1,
      verification: { positionErrorM: 0, radiusErrorM: 0, velocityErrorMps: 0 },
    },
  ],
  rejected: [],
});
const unreachable: ManeuverPlanResult = { version: 1, candidates: [], rejected: [] };

describe('deterministic mission generation', () => {
  it('generates stable reachable offers with fixed integer rewards', () => {
    const first = generateMissionPool('AURORA', reachable(120), reachable(300));
    expect(generateMissionPool('AURORA', reachable(120), reachable(300))).toEqual(first);
    expect(first.map((mission) => mission.type)).toEqual(['CARGO', 'CARGO', 'RECONNAISSANCE']);
    expect(first.every((mission) => Number.isInteger(mission.reward.credits))).toBe(true);
  });

  it('does not offer an unreachable beginner route', () => {
    expect(
      generateMissionPool('VANGUARD', unreachable, reachable(300)).map((mission) => mission.type),
    ).toEqual(['RECONNAISSANCE']);
  });

  it('reports zero transfer ETA inside the destination orbit band', () => {
    expect(generateMissionPool('AURORA', reachable(5000), reachable(300), 450)[0].estimatedEtaSeconds).toBe(
      0,
    );
  });

  it('adds a non-combat interception offer when its rendezvous is reachable', () => {
    const pool = generateMissionPool('AURORA', reachable(120), reachable(300), 400, 1200, reachable(420));
    expect(pool.find((mission) => mission.type === 'INTERCEPT')).toMatchObject({
      destination: { id: 'relay-contact-400' },
      intercept: { identified: false },
    });
  });
});
