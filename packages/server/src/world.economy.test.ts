import { describe, expect, it } from 'vitest';
import { CONFIG, UPGRADE_DEFINITIONS } from '@orbital/shared';
import { availableDeltaV } from '@orbital/simulation';
import { World } from './world';

function dockedWorld() {
  const world = new World();
  world.state.docking.phase = 'DOCKED';
  world.state.docking.selectedStationId = world.state.station.id;
  world.state.docking.portId = world.state.station.ports[0].id;
  return world;
}

describe('authoritative hangar economy', () => {
  it('owns two meaningfully distinct vehicles and switches the active ship', () => {
    const world = dockedWorld(),
      [kestrel, raptor] = world.state.hangar.ships;
    expect(kestrel.definitionId).toBe('KESTREL_LOGISTICS');
    expect(raptor.definitionId).toBe('RAPTOR_COMBAT');
    expect(kestrel.performance.cargoCapacityKg).toBeGreaterThan(raptor.performance.cargoCapacityKg);
    expect(raptor.performance.mainThrustN).toBeGreaterThan(kestrel.performance.mainThrustN);
    expect(raptor.performance.ammunitionCapacityKg).toBeGreaterThan(0);
    expect(world.selectShip('raptor-01', 'switch-1').ok).toBe(true);
    expect(world.state.profile.activeShipId).toBe('raptor-01');
    expect(world.state.ship.definitionId).toBe('RAPTOR_COMBAT');
    expect(world.selectShip('not-owned', 'switch-2')).toMatchObject({ ok: false, code: 'SHIP_NOT_OWNED' });
  });

  it('buys fuel once, rejects overfill and prevents negative balance', () => {
    const world = dockedWorld();
    world.selectShip('raptor-01', 'switch-fuel');
    const beforeCredits = world.state.profile.credits,
      beforeFuel = world.state.ship.mass.propellantKg,
      beforeDv = availableDeltaV(world.state.ship.mass, world.state.ship.performance.specificImpulseSeconds);
    expect(world.buyFuel(100, 'fuel-1')).toEqual({ ok: true, cost: 35 });
    expect(world.state.profile.credits).toBe(beforeCredits - 35);
    expect(world.state.ship.mass.propellantKg).toBe(beforeFuel + 100);
    expect(
      availableDeltaV(world.state.ship.mass, world.state.ship.performance.specificImpulseSeconds),
    ).toBeGreaterThan(beforeDv);
    expect(world.buyFuel(100, 'fuel-1')).toMatchObject({ ok: false, code: 'DUPLICATE_TRANSACTION' });
    expect(world.buyFuel(1000, 'fuel-overfill')).toMatchObject({ ok: false, code: 'FUEL_OVERFILL' });
    world.state.profile.credits = 0;
    expect(world.buyFuel(1, 'fuel-poor')).toMatchObject({ ok: false, code: 'INSUFFICIENT_CREDITS' });
    expect(world.state.profile.credits).toBe(0);
  });

  it('repairs and replenishes the combat-oriented ammunition reserve', () => {
    const world = dockedWorld();
    world.selectShip('raptor-01', 'switch-service');
    const before = world.state.profile.credits;
    expect(world.repairShip('repair-1')).toEqual({ ok: true, cost: 160 });
    expect(world.state.ship.conditionPercent).toBe(100);
    expect(world.repairShip('repair-2')).toMatchObject({ ok: false, code: 'NO_REPAIR_NEEDED' });
    expect(world.buyAmmunition(80, 'ammo-1')).toEqual({ ok: true, cost: 160 });
    expect(world.state.ship.mass.ammunitionKg).toBe(120);
    expect(world.buyAmmunition(1, 'ammo-overfill')).toMatchObject({
      ok: false,
      code: 'AMMUNITION_OVERFILL',
    });
    expect(world.state.profile.credits).toBe(before - 320);
  });

  it('installs exactly four fixed upgrades with real stat effects and rejects exploits', () => {
    expect(UPGRADE_DEFINITIONS).toHaveLength(4);
    const tank = dockedWorld();
    tank.state.profile.credits = 20_000;
    const tankBefore = tank.state.ship.performance.propellantCapacityKg;
    expect(tank.installUpgrade('extended-propellant-cell', 'upgrade-tank').ok).toBe(true);
    expect(tank.state.ship.performance.propellantCapacityKg).toBe(tankBefore + 400);
    expect(tank.installUpgrade('extended-propellant-cell', 'upgrade-tank-2')).toMatchObject({
      ok: false,
      code: 'UPGRADE_ALREADY_INSTALLED',
    });
    expect(tank.installUpgrade('high-flow-injector', 'upgrade-thrust').ok).toBe(true);
    expect(tank.state.ship.performance.mainThrustN).toBeCloseTo(27_600);

    const cargo = dockedWorld();
    cargo.state.profile.credits = 10_000;
    expect(cargo.installUpgrade('modular-cargo-rack', 'upgrade-cargo').ok).toBe(true);
    expect(cargo.state.ship.performance.cargoCapacityKg).toBe(1700);

    const sensor = dockedWorld();
    sensor.state.profile.credits = 10_000;
    expect(sensor.installUpgrade('survey-sensor-array', 'upgrade-sensor').ok).toBe(true);
    expect(sensor.state.ship.performance.sensorScanTimeMultiplier).toBe(0.65);
    expect(sensor.installUpgrade('survey-sensor-array', 'upgrade-sensor')).toMatchObject({
      ok: false,
      code: 'DUPLICATE_TRANSACTION',
    });

    const incompatible = dockedWorld();
    incompatible.state.profile.credits = 10_000;
    incompatible.selectShip('raptor-01', 'switch-upgrade');
    expect(incompatible.installUpgrade('modular-cargo-rack', 'upgrade-invalid')).toMatchObject({
      ok: false,
      code: 'UPGRADE_INCOMPATIBLE',
    });
    incompatible.state.ship.performance.slots.SYSTEMS = 0;
    expect(incompatible.installUpgrade('survey-sensor-array', 'upgrade-slot')).toMatchObject({
      ok: false,
      code: 'UPGRADE_SLOT_FULL',
    });
  });

  it('keeps representative combined service cost within 15–35% of a beginner reward', () => {
    const fuel = Math.ceil(500 * CONFIG.fuelCreditsPerKg),
      repair = Math.ceil(8 * CONFIG.repairCreditsPerPercent),
      ammunition = Math.ceil(40 * CONFIG.ammunitionCreditsPerKg),
      ratio = (fuel + repair + ammunition) / CONFIG.cargoMissionRewardCredits;
    expect(ratio).toBeGreaterThanOrEqual(0.15);
    expect(ratio).toBeLessThanOrEqual(0.35);
    expect(Math.min(...UPGRADE_DEFINITIONS.map((upgrade) => upgrade.priceCredits))).toBeGreaterThan(
      CONFIG.startingCredits + CONFIG.cargoMissionRewardCredits,
    );
    expect(Math.min(...UPGRADE_DEFINITIONS.map((upgrade) => upgrade.priceCredits))).toBeLessThanOrEqual(
      CONFIG.startingCredits + CONFIG.cargoMissionRewardCredits * 2,
    );
  });
});
