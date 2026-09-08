import { CONFIG, type WorldState } from '@orbital/shared';
import { availableDeltaV, dot, length, normalize, sub } from '@orbital/simulation';

function orbitalValues(state: WorldState) {
  const r = state.ship.position, v = state.ship.velocity, radius = length(r), speed = length(v), mu = CONFIG.earthMu,
    energy = speed * speed / 2 - mu / radius,
    semiMajor = energy < 0 ? -mu / (2 * energy) : Number.NaN,
    h = [r[1] * v[2] - r[2] * v[1], r[2] * v[0] - r[0] * v[2], r[0] * v[1] - r[1] * v[0]],
    hMag = Math.hypot(...h),
    eccentricity = Number.isFinite(semiMajor) ? Math.sqrt(Math.max(0, 1 - hMag * hMag / (mu * semiMajor))) : Number.NaN;
  return {
    altitudeKm: (radius - CONFIG.earthRadius) / 1000,
    speedKmS: speed / 1000,
    radialMps: dot(v, normalize(r)),
    apoKm: Number.isFinite(semiMajor) ? (semiMajor * (1 + eccentricity) - CONFIG.earthRadius) / 1000 : undefined,
    periKm: Number.isFinite(semiMajor) ? (semiMajor * (1 - eccentricity) - CONFIG.earthRadius) / 1000 : undefined,
    inclinationDeg: hMag ? Math.acos(Math.max(-1, Math.min(1, h[1] / hMag))) * 180 / Math.PI : undefined,
    periodMin: Number.isFinite(semiMajor) ? 2 * Math.PI * Math.sqrt(semiMajor ** 3 / mu) / 60 : undefined,
  };
}

function attitude([x, y, z, w]: [number, number, number, number]) {
  const pitch = Math.asin(Math.max(-1, Math.min(1, 2 * (w * x - y * z)))),
    yaw = Math.atan2(2 * (w * y + x * z), 1 - 2 * (x * x + y * y)),
    roll = Math.atan2(2 * (w * z + x * y), 1 - 2 * (x * x + z * z));
  return [pitch, yaw, roll].map(v => v * 180 / Math.PI);
}

const Value = ({ label, value, unit = '' }: { label: string; value: string | number; unit?: string }) => <div className="telemetry-value"><small>{label}</small><strong>{value}</strong><em>{unit}</em></div>;

export function TelemetryStrip({ state, clock, onCamera, onDebug }: { state?: WorldState; clock: string; onCamera: () => void; onDebug: () => void }) {
  if (!state) return <aside className="telemetry-strip" aria-label="Sayısal uçuş telemetrisi" />;
  const orbit = orbitalValues(state), [pitch, yaw, roll] = attitude(state.ship.orientation),
    thrustVector = Math.hypot(...state.controls.translation),
    acceleration = thrustVector * state.ship.performance.mainThrustN / state.ship.massKg,
    fuelPercent = state.ship.mass.propellantKg / state.ship.performance.propellantCapacityKg * 100,
    selected = state.combat.contacts.find(item => item.id === state.combat.selectedTargetId),
    relativeVelocity = selected ? sub(selected.velocity, state.ship.velocity) : undefined,
    relativePosition = selected ? sub(selected.position, state.ship.position) : undefined,
    closing = selected && relativeVelocity && relativePosition ? -dot(relativeVelocity, normalize(relativePosition)) : undefined,
    activeManeuver = state.maneuver && ['PLANNED','EXECUTING_BURN','COASTING','ARRIVAL_BURN'].includes(state.maneuver.status),
    nextSeconds = activeManeuver && state.maneuver?.nextEventAtMs ? Math.max(0, (state.maneuver.nextEventAtMs - state.maneuver.updatedAtMs) / 1000) : undefined;
  return (
    <aside className="telemetry-strip" aria-label="Sayısal uçuş telemetrisi">
      <header><span>TELEMETRY</span><b>{clock}</b></header>
      <section><h3>FLIGHT</h3><Value label="ALT" value={orbit.altitudeKm.toFixed(1)} unit="km"/><Value label="VEL" value={orbit.speedKmS.toFixed(3)} unit="km/s"/><Value label="RAD" value={orbit.radialMps.toFixed(1)} unit="m/s"/><Value label="ACC" value={acceleration.toFixed(2)} unit="m/s²"/></section>
      <section><h3>ORBIT</h3><Value label="APO" value={orbit.apoKm?.toFixed(0) ?? '—'} unit="km"/><Value label="PER" value={orbit.periKm?.toFixed(0) ?? '—'} unit="km"/><Value label="INC" value={orbit.inclinationDeg?.toFixed(1) ?? '—'} unit="°"/><Value label="PERIOD" value={orbit.periodMin?.toFixed(1) ?? '—'} unit="min"/></section>
      <section><h3>SHIP</h3><Value label="MASS" value={state.ship.massKg.toFixed(0)} unit="kg"/><Value label="FUEL" value={state.ship.mass.propellantKg.toFixed(0)} unit="kg"/><Value label="FUEL%" value={fuelPercent.toFixed(0)} unit="%"/><Value label="ΔV" value={availableDeltaV(state.ship.mass, state.ship.performance.specificImpulseSeconds).toFixed(0)} unit="m/s"/><Value label="THR" value={(thrustVector * 100).toFixed(0)} unit="%"/></section>
      <section><h3>ATTITUDE</h3><Value label="PITCH" value={pitch.toFixed(1)} unit="°"/><Value label="YAW" value={yaw.toFixed(1)} unit="°"/><Value label="ROLL" value={roll.toFixed(1)} unit="°"/></section>
      {selected && <section className="telemetry-context"><h3>TARGET</h3><Value label="RANGE" value={(selected.rangeM / 1000).toFixed(selected.rangeM < 10_000 ? 2 : 0)} unit="km"/><Value label="REL-V" value={(relativeVelocity ? length(relativeVelocity) : 0).toFixed(1)} unit="m/s"/><Value label="CLOSE" value={closing?.toFixed(1) ?? '—'} unit="m/s"/><Value label="LOCK" value={selected.engagementAllowed ? 'VALID' : 'NO'} /></section>}
      {activeManeuver && <section className="telemetry-context"><h3>MANEUVER</h3><Value label="STATE" value={state.maneuver!.status.replaceAll('_',' ')} /><Value label="NEXT" value={nextSeconds?.toFixed(0) ?? '—'} unit="s"/><Value label="BURN" value={(state.maneuver!.activeBurnIndex ?? 0) + 1} /></section>}
      {state.docking.selectedStationId === state.station.id && state.docking.metrics && <section className="telemetry-context docking" data-testid="docking-telemetry"><h3>DOCKING</h3><Value label="RANGE" value={state.docking.metrics.rangeM.toFixed(state.docking.metrics.rangeM < 100 ? 1 : 0)} unit="m"/><Value label="REL-V" value={state.docking.metrics.relativeSpeedMps.toFixed(2)} unit="m/s"/><Value label="CLOSE" value={state.docking.metrics.closingSpeedMps.toFixed(2)} unit="m/s"/><Value label="LATERAL" value={state.docking.metrics.lateralErrorM.toFixed(1)} unit="m"/><Value label="VERT" value={state.docking.metrics.verticalErrorM.toFixed(1)} unit="m"/><Value label="FWD" value={(state.docking.metrics.forwardAlignment * 100).toFixed(0)} unit="%"/><Value label="YAW" value={state.docking.metrics.yawErrorDeg.toFixed(1)} unit="°"/><Value label="PITCH" value={state.docking.metrics.pitchErrorDeg.toFixed(1)} unit="°"/><Value label="ROLL" value={state.docking.metrics.rollErrorDeg.toFixed(1)} unit="°"/><Value label="STATE" value={state.docking.phase.replaceAll('_',' ')} /></section>}
      {(selected || state.combat.combatTagUntilMs > state.combat.serverNowMs || state.combat.missiles.some(item => item.status === 'ACTIVE')) && <section className="telemetry-context combat"><h3>COMBAT</h3><Value label="LASER" value={state.combat.laserEnergy.toFixed(0)} unit="%"/><Value label="HEAT" value={state.combat.laserHeat.toFixed(0)} unit="%"/><Value label="MISS" value={state.ship.mass.ammunitionKg.toFixed(0)} unit="kg"/><Value label="CM" value={state.combat.countermeasureCharges}/></section>}
      <footer><button onClick={onCamera} aria-label="Kamerayı toparla">CAM <kbd>C</kbd></button><button onClick={onDebug} aria-label="Telemetri ayrıntıları">DATA <kbd>F3</kbd></button></footer>
    </aside>
  );
}
