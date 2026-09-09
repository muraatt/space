import { describe, expect, it } from 'vitest';
import { ManeuverPlanStore } from './plan-store';

describe('connection maneuver plan store', () => {
  it('caps live plans and expires both plans and consumed receipts', () => {
    const store = new ManeuverPlanStore<number>(2, 100);
    expect(store.set('a', 1, 1_000)).toBe(true);
    expect(store.set('b', 2, 1_000)).toBe(true);
    expect(store.set('c', 3, 1_000)).toBe(false);
    store.consume('a', 1_010);
    expect(store.wasConsumed('a', 1_010)).toBe(true);
    expect(store.set('c', 3, 1_010)).toBe(true);
    expect(store.get('b', 1_099)).toBe(2);
    expect(store.get('b', 1_100)).toBeUndefined();
    expect(store.wasConsumed('a', 1_110)).toBe(false);
    expect(store.size).toBe(0);
  });
});
