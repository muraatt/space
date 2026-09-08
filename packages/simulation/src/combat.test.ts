import { describe, expect, it } from 'vitest';
import { CONFIG, type MissileState } from '@orbital/shared';
import { segmentSphereHit, stepGuidedMissile } from './combat';

const missile = (): MissileState => ({
  id: 'm-1',
  sourceId: 'source',
  targetId: 'target',
  position: [0, 0, 0],
  previousPosition: [0, 0, 0],
  velocity: [0, 0, 2_000],
  remainingPropulsionSeconds: 0,
  remainingLifetimeSeconds: 1,
  damage: 10,
  status: 'ACTIVE',
});

describe('deterministic missile mechanics', () => {
  it('detects a swept collision that occurs between fixed ticks', () => {
    expect(segmentSphereHit([0, 0, -100], [0, 0, 100], [0, 0, 0], 2)).toBe(true);
    expect(segmentSphereHit([10, 0, -100], [10, 0, 100], [0, 0, 0], 2)).toBe(false);
  });

  it('produces the same guided state for the same injected input', () => {
    const a = stepGuidedMissile(missile(), [0, 0, 500], CONFIG.fixedDt),
      b = stepGuidedMissile(missile(), [0, 0, 500], CONFIG.fixedDt);
    expect(a).toEqual(b);
    expect(a.position[2]).toBeGreaterThan(0);
  });

  it('expires after its finite lifetime', () => {
    let state = missile();
    for (let i = 0; i < 61; i++) state = stepGuidedMissile(state, [0, 0, 100_000], CONFIG.fixedDt);
    expect(state.status).toBe('EXPIRED');
  });
});
