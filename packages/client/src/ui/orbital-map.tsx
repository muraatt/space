import { CONFIG, type ManeuverCandidate, type Vec3, type WorldState } from '@orbital/shared';
import { cross, dot, length, normalize, scale, sub } from '@orbital/simulation';

const project = (point: Vec3, scaleM: number) => {
  const x = point[0] / scaleM,
    y = point[1] / scaleM,
    z = point[2] / scaleM;
  return [128 + (x - z * 0.58) * 82, 94 - y * 64 + (x + z) * 12] as const;
};

function osculatingPath(position: Vec3, velocity: Vec3, scaleM: number) {
  const mu = CONFIG.earthMu,
    h = cross(position, velocity),
    h2 = dot(h, h),
    eccentricity = sub(scale(cross(velocity, h), 1 / mu), normalize(position)),
    e = length(eccentricity),
    p = h2 / mu,
    pHat = e > 1e-5 ? normalize(eccentricity) : normalize(position),
    qHat = normalize(cross(normalize(h), pHat));
  if (![e, p].every(Number.isFinite) || e >= 0.98 || p <= CONFIG.earthRadius) return '';
  const points: string[] = [];
  for (let i = 0; i <= 96; i++) {
    const anomaly = (i / 96) * Math.PI * 2,
      radius = p / (1 + e * Math.cos(anomaly)),
      world = [
        (pHat[0] * Math.cos(anomaly) + qHat[0] * Math.sin(anomaly)) * radius,
        (pHat[1] * Math.cos(anomaly) + qHat[1] * Math.sin(anomaly)) * radius,
        (pHat[2] * Math.cos(anomaly) + qHat[2] * Math.sin(anomaly)) * radius,
      ] as Vec3,
      [x, y] = project(world, scaleM);
    points.push(`${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return points.join(' ');
}

function circularPath(radiusM: number, scaleM: number) {
  const points: string[] = [];
  for (let i = 0; i <= 80; i++) {
    const angle = (i / 80) * Math.PI * 2,
      [x, y] = project([Math.cos(angle) * radiusM, 0, -Math.sin(angle) * radiusM], scaleM);
    points.push(`${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return points.join(' ');
}

export function OrbitalMap({
  state,
  targetRadiusM,
  targetPosition,
  candidate,
}: {
  state?: WorldState;
  targetRadiusM?: number;
  targetPosition?: Vec3;
  candidate?: ManeuverCandidate;
}) {
  if (!state) return <section className="orbital-map" aria-label="Canlı 3B yörünge haritası">BAĞLANTI</section>;
  const currentRadius = length(state.ship.position),
    finalRadius = candidate ? length(candidate.expectedFinalState.position) : 0,
    scaleM = Math.max(currentRadius, targetRadiusM ?? 0, finalRadius, CONFIG.earthRadius * 1.08),
    player = project(state.ship.position, scaleM),
    target = targetPosition ? project(targetPosition, scaleM) : targetRadiusM
      ? project([targetRadiusM * Math.cos(0.65), 0, -targetRadiusM * Math.sin(0.65)], scaleM)
      : undefined,
    currentPath = osculatingPath(state.ship.position, state.ship.velocity, scaleM),
    targetPath = targetRadiusM ? circularPath(targetRadiusM, scaleM) : '',
    transferPath = candidate
      ? `M${player[0].toFixed(1)},${player[1].toFixed(1)} Q128,22 ${project(candidate.expectedFinalState.position, scaleM).map(v => v.toFixed(1)).join(',')}`
      : '';
  return (
    <section className="orbital-map" aria-label="Canlı 3B yörünge haritası">
      <header><span>ORBIT / LIVE</span><b>ECI</b></header>
      <svg viewBox="0 0 256 188" role="img" aria-label="Dünya, mevcut yörünge ve hedef">
        <defs>
          <radialGradient id="map-earth" cx="35%" cy="28%"><stop stopColor="#77b4c8"/><stop offset=".5" stopColor="#193d50"/><stop offset="1" stopColor="#07141e"/></radialGradient>
          <filter id="map-glow"><feGaussianBlur stdDeviation="2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <circle cx="128" cy="94" r="38" className="map-glow" />
        <circle cx="128" cy="94" r="35" fill="url(#map-earth)" className="map-earth-live" />
        <path d="M95 91 Q128 107 160 84 M115 61 Q101 95 136 127" className="map-grid" />
        {targetPath && <path d={targetPath} className="map-target-live" />}
        {currentPath && <path d={currentPath} className="map-current-live" />}
        {transferPath && <path d={transferPath} className="map-transfer-live" />}
        {target && <g transform={`translate(${target[0]} ${target[1]})`} className="map-target-marker"><circle r="5"/><path d="M-9 0H9M0-9V9"/></g>}
        <g transform={`translate(${player[0]} ${player[1]})`} className="map-player" data-testid="orbit-map-player"><circle r="4"/><path d="M-8 0H8M0-8V8"/></g>
      </svg>
      <footer><span>ALT {(currentRadius - CONFIG.earthRadius).toFixed(0)} m</span><span>{candidate ? candidate.type : state.maneuver?.status ?? 'FREE'}</span></footer>
    </section>
  );
}
