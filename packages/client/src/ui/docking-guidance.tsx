import type { WorldState } from '@orbital/shared';

const labels: Record<string, string> = {
  RENDEZVOUS: 'RENDEZVOUS REQUIRED',
  APPROACH: 'FOLLOW APPROACH AXIS',
  ALIGN_POSITION: 'ALIGN PORT CENTER',
  ALIGN_ATTITUDE: 'ALIGN ATTITUDE',
  TOO_FAST: 'REDUCE RELATIVE SPEED',
  READY: 'CAPTURE READY',
  CAPTURED: 'DOCKED',
  UNDOCKED: 'SAFE SEPARATION',
};

export function DockingGuidance({ state }: { state?: WorldState }) {
  const docking = state?.docking;
  if (!state || docking?.selectedStationId !== state.station.id || !docking.metrics) return null;
  const alert = docking.guidance === 'TOO_FAST' || docking.lastResultCode?.includes('ERROR') || docking.lastResultCode === 'HARD_IMPACT';
  return <aside className={`docking-guidance ${alert ? 'warning' : ''} ${docking.phase === 'DOCKED' ? 'docked' : ''}`} aria-label="Yanaşma kılavuzu" data-testid="docking-guidance">
    <div className="dock-axis" aria-hidden="true"><i/><span/><i/></div>
    <small>{state.station.name} / ALPHA</small>
    <strong>{labels[docking.guidance] ?? docking.guidance}</strong>
    <span>{docking.metrics.rangeM.toFixed(1)} m · Δv {docking.metrics.relativeSpeedMps.toFixed(2)} m/s · LAT {docking.metrics.lateralErrorM.toFixed(1)} m</span>
    {docking.lastResultCode && docking.lastResultCode !== 'DOCKED' && docking.lastResultCode !== 'UNDOCKED' && <b>{docking.lastResultCode.replaceAll('_', ' ')}</b>}
  </aside>;
}
