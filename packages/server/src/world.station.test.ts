import { describe, expect, it } from 'vitest';
import { CONFIG, STATION_ID, STATION_PORT_ID } from '@orbital/shared';
import { add, dockingMetrics, generateManeuverPlan, length, scale, stationPortWorld } from '@orbital/simulation';
import { dispatch } from './commands/dispatch';
import { World } from './world';

function selectedWorld(scene: 'station_rendezvous' | 'station_docking' = 'station_docking') {
  const world = new World();
  world.reset(scene, true);
  expect(world.selectStation(STATION_ID, `select-${scene}`).ok).toBe(true);
  return world;
}

function placeAtPort(world: World, options: { axial?: number; lateral?: number; relativeSpeed?: number; orientation?: [number, number, number, number] } = {}) {
  const port = world.state.station.ports[0], pose = stationPortWorld(world.state.station, port),
    axial = options.axial ?? 0.5, lateral = options.lateral ?? 0;
  world.state.ship.position = add(add(pose.position, scale(pose.approachAxis, axial)), [lateral, 0, 0]);
  world.state.ship.velocity = add(world.state.station.velocity, scale(pose.approachAxis, -(options.relativeSpeed ?? 0)));
  world.state.ship.orientation = options.orientation ?? [0, 0, 0, 1];
  world.state.ship.angularVelocity = [0, 0, 0];
}

describe('authoritative station and docking', () => {
  it('propagates one stable station in the shared two-body world', () => {
    const world = new World(), before = structuredClone(world.state.station.position), radius = length(before);
    for (let tick = 0; tick < 600; tick++) world.tick(tick * 17, CONFIG.epochMs + tick * 1000 / 60);
    expect(world.state.station.id).toBe(STATION_ID);
    expect(world.state.station.position).not.toEqual(before);
    expect(length(world.state.station.position)).toBeCloseTo(radius, -1);
    expect(world.state.station.ports).toHaveLength(1);
  });

  it('resolves station rendezvous through the existing maneuver planner geometry', () => {
    const world = selectedWorld('station_rendezvous'), target = world.stationManeuverTarget(STATION_ID)!;
    expect(target.kind).toBe('NEAR_RENDEZVOUS_STATE');
    const plan = generateManeuverPlan(world.state.ship, target);
    expect(plan.candidates.length).toBeGreaterThan(0);
    expect(plan.candidates[0].verification.positionErrorM).toBeLessThan(25_000);
  });

  it('enters approach from authoritative relative state and rejects invalid station ids', () => {
    const world = new World();
    world.reset('station_rendezvous', true);
    expect(world.selectStation('forged-station', 'bad-station')).toMatchObject({ ok: false, code: 'UNKNOWN_STATION' });
    expect(world.selectStation(STATION_ID, 'station-ok').ok).toBe(true);
    expect(world.state.docking.phase).toBe('RENDEZVOUS');
    expect(world.state.docking.metrics!.rangeM).toBeLessThan(CONFIG.stationRendezvousRangeM);
    const final = selectedWorld('station_docking');
    expect(final.state.docking.phase).toBe('FINAL_APPROACH');
  });

  it('captures only a close, slow and aligned ship and keeps it attached', () => {
    const world = selectedWorld();
    placeAtPort(world);
    expect(world.requestDock(STATION_ID, STATION_PORT_ID, 'dock-valid', CONFIG.epochMs).ok).toBe(true);
    expect(world.state.docking.phase).toBe('DOCKED');
    const before = dockingMetrics(world.state.ship, world.state.station, world.state.station.ports[0]);
    expect(before.rangeM).toBeLessThan(1);
    world.paused = false;
    for (let tick = 0; tick < 120; tick++) world.tick(tick * 17, CONFIG.epochMs + tick * 1000 / 60);
    const after = dockingMetrics(world.state.ship, world.state.station, world.state.station.ports[0]);
    expect(after.rangeM).toBeLessThan(1);
    expect(world.state.controls.translation).toEqual([0, 0, 0]);
    expect(dispatch(world.state, { type: 'input', version: 1, shipId: world.state.ship.id, seq: 50, translation: [0, 0, -1], rotation: [0, 0, 0] }, world.state.ship.id)).toMatchObject({ ok: false, code: 'DOCKED' });
    expect(world.requestDock(STATION_ID, STATION_PORT_ID, 'dock-valid', CONFIG.epochMs)).toMatchObject({ ok: false, code: 'DUPLICATE_DOCKING_COMMAND' });
  });

  it('rejects excessive speed, bad alignment and wrong-side geometry', () => {
    const fast = selectedWorld();
    placeAtPort(fast, { relativeSpeed: 6 });
    const hull = fast.state.combat.playerHull;
    expect(fast.requestDock(STATION_ID, STATION_PORT_ID, 'dock-fast', CONFIG.epochMs)).toMatchObject({ ok: false, code: 'HARD_IMPACT' });
    expect(fast.state.combat.playerHull).toBeLessThan(hull);

    const misaligned = selectedWorld();
    placeAtPort(misaligned, { orientation: [0, 1, 0, 0] });
    expect(misaligned.requestDock(STATION_ID, STATION_PORT_ID, 'dock-align', CONFIG.epochMs)).toMatchObject({ ok: false, code: 'DOCKING_ALIGNMENT_ERROR' });

    const wrongSide = selectedWorld();
    placeAtPort(wrongSide, { axial: -0.5 });
    expect(wrongSide.requestDock(STATION_ID, STATION_PORT_ID, 'dock-side', CONFIG.epochMs)).toMatchObject({ ok: false, code: 'WRONG_APPROACH_GEOMETRY' });
  });

  it('gates services by station identity and restores manual flight after undock', () => {
    const world = selectedWorld();
    world.state.ship.mass.propellantKg -= 100;
    world.state.ship.massKg -= 100;
    expect(world.buyFuel(10, 'fuel-undocked', STATION_ID)).toMatchObject({ ok: false, code: 'SERVICE_REQUIRES_DOCKING' });
    placeAtPort(world);
    expect(world.requestDock(STATION_ID, STATION_PORT_ID, 'dock-services', CONFIG.epochMs).ok).toBe(true);
    expect(world.buyFuel(10, 'fuel-forged-station', 'forged-station')).toMatchObject({ ok: false, code: 'SERVICE_REQUIRES_DOCKING' });
    expect(world.buyFuel(10, 'fuel-docked', STATION_ID).ok).toBe(true);
    expect(world.undock(STATION_ID, 'undock-valid').ok).toBe(true);
    expect(world.state.docking.phase).toBe('FINAL_APPROACH');
    expect(world.state.docking.metrics!.rangeM).toBeCloseTo(CONFIG.stationUndockSeparationM, 0);
    expect(dispatch(world.state, { type: 'input', version: 1, shipId: world.state.ship.id, seq: 70, translation: [0, 0, -1], rotation: [0, 0.5, 0] }, world.state.ship.id).ok).toBe(true);
    expect(world.undock(STATION_ID, 'undock-valid')).toMatchObject({ ok: false, code: 'DUPLICATE_DOCKING_COMMAND' });
  });
});
