import { describe, expect, it } from 'vitest';
import { CONFIG, type ManeuverTarget } from '@orbital/shared';
import { propagateKepler } from '@orbital/simulation';
import { World } from '../world';
import { createManeuverPlanFingerprint, validateManeuverPlanFingerprint } from './fingerprint';

describe('maneuver plan assumption fingerprint', () => {
  const setup = () => {
    const world = new World(), epochMs = 1_800_000_000_000,
      target: ManeuverTarget = {
        kind: 'NEAR_RENDEZVOUS_STATE',
        state: {
          position: [world.state.ship.position[0] + 20_000, ...world.state.ship.position.slice(1)] as [number, number, number],
          velocity: [...world.state.ship.velocity],
        },
      },
      fingerprint = createManeuverPlanFingerprint(
        world.state.ship,
        world.state.profile.activeShipId,
        target,
        epochMs,
        'target-01',
      );
    return { world, epochMs, target, fingerprint };
  };

  it('accepts only natural propagation within the short plan lifetime', () => {
    const { world, epochMs, target, fingerprint } = setup(), elapsedSeconds = 2;
    Object.assign(world.state.ship, propagateKepler(
      { position: world.state.ship.position, velocity: world.state.ship.velocity },
      elapsedSeconds,
    ));
    const currentTarget = target.kind === 'NEAR_RENDEZVOUS_STATE'
      ? { kind: target.kind, state: propagateKepler(target.state, elapsedSeconds) } as ManeuverTarget
      : target;
    expect(validateManeuverPlanFingerprint(
      fingerprint,
      world.state.ship,
      world.state.profile.activeShipId,
      currentTarget,
      epochMs + elapsedSeconds * 1000,
    )).toMatchObject({ ok: true });
    expect(validateManeuverPlanFingerprint(
      fingerprint,
      world.state.ship,
      world.state.profile.activeShipId,
      currentTarget,
      epochMs + CONFIG.maneuverPlanTtlMs + 1,
    )).toMatchObject({ ok: false, reason: 'PLAN_EXPIRED' });
  });

  it.each([
    ['manual position', (world: World) => { world.state.ship.position[0] += 201; }, 'SHIP_POSITION_CHANGED'],
    ['velocity', (world: World) => { world.state.ship.velocity[0] += 2.01; }, 'SHIP_VELOCITY_CHANGED'],
    ['fuel', (world: World) => { world.state.ship.mass.propellantKg -= 1; }, 'SHIP_MASS_OR_FUEL_CHANGED'],
    ['engine', (world: World) => { world.state.ship.performance.mainThrustN *= 0.9; }, 'PROPULSION_CHANGED'],
    ['ship replacement', (world: World) => { world.state.ship.id = 'replacement-ship'; }, 'ACTIVE_SHIP_CHANGED'],
    ['ship swap', (world: World) => { world.state.profile.activeShipId = 'raptor-01'; }, 'ACTIVE_SHIP_CHANGED'],
  ])('rejects %s before fuel can be consumed', (_label, mutate, reason) => {
    const { world, epochMs, target, fingerprint } = setup();
    mutate(world);
    const fuel = world.state.ship.mass.propellantKg;
    expect(validateManeuverPlanFingerprint(
      fingerprint,
      world.state.ship,
      world.state.profile.activeShipId,
      target,
      epochMs,
    )).toMatchObject({ ok: false, code: 'REPLAN_REQUIRED', reason });
    expect(world.state.ship.mass.propellantKg).toBe(fuel);
  });

  it('rejects a changed target state/epoch', () => {
    const { world, epochMs, target, fingerprint } = setup();
    if (target.kind !== 'NEAR_RENDEZVOUS_STATE') throw new Error('Expected rendezvous target');
    const changed = structuredClone(target);
    changed.state.position[0] += 5_001;
    expect(validateManeuverPlanFingerprint(
      fingerprint,
      world.state.ship,
      world.state.profile.activeShipId,
      changed,
      epochMs,
    )).toMatchObject({ ok: false, reason: 'TARGET_STATE_CHANGED' });
  });
});
