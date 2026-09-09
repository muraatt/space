import { type MissionInstance, type WorldState } from '@orbital/shared';
import { livePlayers } from '../live-players';

export function OpsPanel({ state, expanded, onToggle, onMissions, onPlanner, onCombat, onSelectStation, onDock, onUndock, onServices }: {
  state?: WorldState; expanded: boolean; onToggle: () => void; onMissions: () => void; onPlanner: () => void; onCombat: () => void;
  onSelectStation: () => void; onDock: () => void; onUndock: () => void; onServices: () => void;
}) {
  const mission: MissionInstance | undefined = state?.missions.find(item => item.id === state.profile.activeMissionId),
    target = state?.combat.contacts.find(item => item.id === (state.combat.selectedTargetId ?? mission?.bounty?.targetId)),
    maneuver = state?.maneuver,
    incoming = state?.combat.missiles.filter(item => item.status === 'ACTIVE' && item.targetId === state.ship.id).length ?? 0,
    stationSelected = state?.docking.selectedStationId === state?.station.id,
    docking = state?.docking;
  return <aside className={`ops-panel ${expanded ? 'expanded' : ''}`} aria-label="Operasyon paneli">
    <button className="ops-toggle" onClick={onToggle} aria-expanded={expanded}><span>{expanded ? '▼' : '▲'}</span> OPS <b>{docking?.phase === 'DOCKED' ? 'DOCKED' : stationSelected ? 'STATION' : mission ? 'CONTRACT' : target ? 'TARGET' : maneuver && maneuver.status !== 'IDLE' ? 'NAV' : 'STANDBY'}</b></button>
    {expanded && <div className="ops-content">
      <header><span>OPERATIONS / LIVE</span><i className={incoming ? 'danger' : ''}>{incoming ? `${incoming} INCOMING` : state?.combat.region ?? '—'}</i></header>
      {mission ? <section data-testid="ops-contract"><small>ACTIVE CONTRACT</small><strong>{mission.type}</strong><span>{mission.title}</span><dl><dt>DEST</dt><dd>{mission.destination.altitudeKm} km</dd>{mission.bounty && <><dt>CLASS</dt><dd>{mission.bounty.targetClass}</dd><dt>THREAT</dt><dd>{mission.bounty.threat}</dd></>}<dt>REWARD</dt><dd>{mission.reward.credits} cr</dd><dt>STATUS</dt><dd>{mission.bounty?.neutralized ? 'NEUTRALIZED' : mission.status}</dd></dl></section> : <section><small>ACTIVE CONTRACT</small><strong>NONE</strong><span>Contract computer standing by.</span></section>}
      {target && <section><small>TARGET</small><strong>{target.label}</strong><dl><dt>RANGE</dt><dd>{(target.rangeM / 1000).toFixed(2)} km</dd><dt>HULL</dt><dd>{target.health.toFixed(0)}%</dd><dt>AUTH</dt><dd>{target.engagementAllowed ? 'YES' : 'NO'}</dd></dl></section>}
      <section data-testid="ops-station"><small>STATION</small><strong>{state?.station.name ?? 'AEGIS'}</strong>{stationSelected && docking?.metrics ? <dl><dt>RANGE</dt><dd>{docking.metrics.rangeM < 1000 ? `${docking.metrics.rangeM.toFixed(1)} m` : `${(docking.metrics.rangeM / 1000).toFixed(2)} km`}</dd><dt>REL-V</dt><dd>{docking.metrics.relativeSpeedMps.toFixed(2)} m/s</dd><dt>DOCK</dt><dd>{docking.guidance}</dd></dl> : <span>450 km neutral service orbit.</span>}<div className="ops-station-actions">{!stationSelected && <button data-testid="select-station" onClick={onSelectStation}>TARGET STATION</button>}{stationSelected && docking?.phase !== 'DOCKED' && <button data-testid="request-dock" onClick={onDock}>REQUEST CAPTURE</button>}{docking?.phase === 'DOCKED' && <><button data-testid="station-services" onClick={onServices}>SERVICES</button><button data-testid="undock" onClick={onUndock}>UNDOCK</button></>}</div></section>
      <section><small>NAVIGATION</small><strong>{maneuver?.status ?? 'FREE FLIGHT'}</strong>{maneuver?.nextEventAtMs && <span>NEXT {Math.max(0, (maneuver.nextEventAtMs - maneuver.updatedAtMs) / 1000).toFixed(0)} s</span>}</section>
      <section data-testid="shared-pilots"><small>SHARED PILOTS</small><strong>{livePlayers(state?.remotePlayers ?? []).length} ONLINE</strong>{state && livePlayers(state.remotePlayers).map(player => <span key={player.playerId}>{player.callsign} · {player.presence} · {(Math.hypot(player.ship.position[0] - state.ship.position[0], player.ship.position[1] - state.ship.position[1], player.ship.position[2] - state.ship.position[2]) / 1000).toFixed(2)} km</span>)}</section>
      <nav aria-label="Hızlı operasyonlar"><button onClick={onMissions}>CONTRACTS</button><button onClick={onPlanner}>MANEUVER</button><button onClick={onCombat}>TACTICAL</button></nav>
    </div>}
  </aside>;
}
