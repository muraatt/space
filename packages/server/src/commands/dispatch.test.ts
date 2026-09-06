import { describe, expect, it } from 'vitest';
import { initialWorld } from '@orbital/simulation';
import { dispatch } from './dispatch';
import { World } from '../world';
const input = {
  type: 'input',
  version: 1,
  shipId: 'kestrel-01',
  seq: 1,
  translation: [0, 0, -1],
  rotation: [0, 0, 0],
};
describe('authoritative dispatch', () => {
  it('cannot control another ship', () => {
    const w = initialWorld();
    expect(dispatch(w, { ...input, shipId: 'other' }, 'kestrel-01')).toEqual({
      ok: false,
      code: 'NOT_OWNER',
    });
    expect(w.controls.translation).toEqual([0, 0, 0]);
  });
  it('rejects duplicates and out-of-order input', () => {
    const w = initialWorld();
    expect(dispatch(w, input, w.ship.id).ok).toBe(true);
    expect(dispatch(w, input, w.ship.id).ok).toBe(false);
    expect(dispatch(w, { ...input, seq: 0 }, w.ship.id).ok).toBe(false);
  });
  it('does not apply position, mass or balance from the wire', () => {
    const w = initialWorld(),
      before = structuredClone(w);
    expect(dispatch(w, { ...input, position: [1, 2, 3], massKg: 1 }, w.ship.id).ok).toBe(false);
    expect(w).toEqual(before);
  });
  it('releases stale controls without stopping the spacecraft', () => {
    const w = new World();
    dispatch(w.state, input, w.state.ship.id);
    w.lastInputAt = 100;
    w.tick(351);
    expect(w.state.controls.translation).toEqual([0, 0, 0]);
    expect(Math.hypot(...w.state.ship.velocity)).toBeGreaterThan(7600);
  });
});
