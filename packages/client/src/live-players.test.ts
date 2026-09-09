import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { initialWorld } from '@orbital/simulation';
import { livePlayers } from './live-players';
import { OrbitalMap } from './ui/orbital-map';
import { OpsPanel } from './ui/ops-panel';
import { RemotePlayersVisual } from './render/remote-players';
import { renderFrame } from './render/render-frame';

describe('CAN-028 truthful offline spatial presence', () => {
  it('hides offline ranges, map markers/orbits and 3D ships using one policy', () => {
    const state = initialWorld(), ship = structuredClone(state.ship);
    ship.position = [1e12, 0, 0];
    state.remotePlayers = [{ playerId: 'offline', callsign: 'FROZEN_PILOT', shipId: ship.id, ship, presence: 'OFFLINE' }];
    expect(livePlayers(state.remotePlayers)).toEqual([]);
    const map = renderToStaticMarkup(createElement(OrbitalMap, { state }));
    const emptyMap = renderToStaticMarkup(createElement(OrbitalMap, { state: { ...state, remotePlayers: [] } }));
    expect(map).toBe(emptyMap);
    const noop = () => {};
    const ops = renderToStaticMarkup(createElement(OpsPanel, { state, expanded: true, onToggle: noop, onMissions: noop,
      onPlanner: noop, onCombat: noop, onSelectStation: noop, onDock: noop, onUndock: noop, onServices: noop }));
    expect(ops).not.toContain('FROZEN_PILOT'); expect(ops).toContain('0 ONLINE');
    const visual = new RemotePlayersVisual(); visual.update(state.remotePlayers, renderFrame(state.ship));
    expect(visual.group.children).toHaveLength(0);
  });
});
