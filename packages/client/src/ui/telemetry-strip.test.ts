import { describe, expect, it } from 'vitest';
import { initialWorld } from '@orbital/simulation';
import { propulsionAccelerationMps2 } from './telemetry-strip';

describe('CAN-018 truthful propulsion telemetry', () => {
  it('uses axis-specific authoritative propulsion and fuel availability', () => {
    const state = initialWorld('orbit_day');
    state.controls.translation = [0, 0, -1];
    const main = propulsionAccelerationMps2(state);
    state.controls.translation = [1, 0, 0];
    const lateral = propulsionAccelerationMps2(state);
    state.controls.translation = [0, 1, 0];
    const vertical = propulsionAccelerationMps2(state);
    expect(main).toBeCloseTo(state.ship.performance.mainThrustN / state.ship.massKg, 4);
    expect(lateral).toBeCloseTo(state.ship.performance.translationThrustN / state.ship.massKg, 4);
    expect(vertical).toBeCloseTo(lateral, 10);
    expect(main).toBeGreaterThan(lateral);
    state.ship.mass.propellantKg = 0;
    expect(propulsionAccelerationMps2(state)).toBe(0);
  });
});
