import { type MissionInstance, type WorldState } from '@orbital/shared';

export function OpsPanel({ state, expanded, onToggle, onMissions, onPlanner, onCombat }: {
  state?: WorldState; expanded: boolean; onToggle: () => void; onMissions: () => void; onPlanner: () => void; onCombat: () => void;
}) {
  const mission: MissionInstance | undefined = state?.missions.find(item => item.id === state.profile.activeMissionId),
    target = state?.combat.contacts.find(item => item.id === state.combat.selectedTargetId),
    maneuver = state?.maneuver,
    incoming = state?.combat.missiles.filter(item => item.status === 'ACTIVE' && item.targetId === state.ship.id).length ?? 0;
  return <aside className={`ops-panel ${expanded ? 'expanded' : ''}`} aria-label="Operasyon paneli">
    <button className="ops-toggle" onClick={onToggle} aria-expanded={expanded}><span>{expanded ? '▼' : '▲'}</span> OPS <b>{mission ? 'CONTRACT' : target ? 'TARGET' : maneuver && maneuver.status !== 'IDLE' ? 'NAV' : 'STANDBY'}</b></button>
    {expanded && <div className="ops-content">
      <header><span>OPERATIONS / LIVE</span><i className={incoming ? 'danger' : ''}>{incoming ? `${incoming} INCOMING` : state?.combat.region ?? '—'}</i></header>
      {mission ? <section><small>ACTIVE CONTRACT</small><strong>{mission.type}</strong><span>{mission.title}</span><dl><dt>DEST</dt><dd>{mission.destination.altitudeKm} km</dd><dt>REWARD</dt><dd>{mission.reward.credits} cr</dd><dt>STATUS</dt><dd>{mission.status}</dd></dl></section> : <section><small>ACTIVE CONTRACT</small><strong>NONE</strong><span>Contract computer standing by.</span></section>}
      {target && <section><small>TARGET</small><strong>{target.label}</strong><dl><dt>RANGE</dt><dd>{(target.rangeM / 1000).toFixed(2)} km</dd><dt>HULL</dt><dd>{target.health.toFixed(0)}%</dd><dt>AUTH</dt><dd>{target.engagementAllowed ? 'YES' : 'NO'}</dd></dl></section>}
      <section><small>NAVIGATION</small><strong>{maneuver?.status ?? 'FREE FLIGHT'}</strong>{maneuver?.nextEventAtMs && <span>NEXT {Math.max(0, (maneuver.nextEventAtMs - maneuver.updatedAtMs) / 1000).toFixed(0)} s</span>}</section>
      <nav aria-label="Hızlı operasyonlar"><button onClick={onMissions}>CONTRACTS</button><button onClick={onPlanner}>MANEUVER</button><button onClick={onCombat}>TACTICAL</button></nav>
    </div>}
  </aside>;
}
