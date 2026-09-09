import { describe, expect, it } from 'vitest';
import { initialWorld } from './step';
import { dockingMetrics } from './docking';
import type { Quat } from '@orbital/shared';

const axisAngle = (axis: 'x' | 'y', degrees: number): Quat => {
  const half = degrees * Math.PI / 360, sine = Math.sin(half), cosine = Math.cos(half);
  return axis === 'x' ? [sine, 0, 0, cosine] : [0, sine, 0, cosine];
};

describe('CAN-031 truthful docking attitude telemetry', () => {
  it.each([0, 30, 90, 120, 180])('reports %d degree yaw instead of folding backwards attitudes', (degrees) => {
    const state = initialWorld('station_docking');
    state.ship.orientation = axisAngle('y', degrees);
    const metrics = dockingMetrics(state.ship, state.station, state.station.ports[0]);
    expect(Math.abs(metrics.yawErrorDeg)).toBeCloseTo(degrees, 8);
  });

  it.each([0, 30, 90, 120, 180])('reports %d degree pitch instead of folding backwards attitudes', (degrees) => {
    const state = initialWorld('station_docking');
    state.ship.orientation = axisAngle('x', degrees);
    const metrics = dockingMetrics(state.ship, state.station, state.station.ports[0]);
    expect(Math.abs(metrics.pitchErrorDeg)).toBeCloseTo(degrees, 8);
  });
});
