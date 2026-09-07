import { CONFIG, FACTIONS, type FactionId, type MissionInstance, type WorldState } from '@orbital/shared';
import { length } from '@orbital/simulation';

const duration = (seconds: number) => {
  if (seconds <= 1) return 'HEDEFTE';
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} sa ${minutes % 60} dk` : `${minutes} dk`;
};

const errorText: Record<string, string> = {
  FACTION_REQUIRED: 'Önce bir fraksiyon seç.',
  FACTION_LOCKED: 'Bu geliştirme profili bir fraksiyona bağlandı.',
  MISSION_ACTIVE: 'Önce etkin görevi tamamla veya terk et.',
  UNKNOWN_MISSION: 'Görev örneği artık geçerli değil.',
  INVALID_MISSION_STATE: 'Bu görev mevcut durumunda bu işlemi kabul etmiyor.',
  MISSION_UNREACHABLE: 'Araç bu görevin hedefine ulaşamıyor.',
  MISSION_AFFILIATION: 'Görev profil fraksiyonuyla eşleşmiyor.',
  INVALID_CARGO: 'Göreve bağlı kargo kimliği doğrulanamadı.',
  WRONG_DESTINATION: 'Bu işlem yanlış hedefte istendi.',
  NOT_AT_DESTINATION: 'Teslimat için hedef yörüngeye ulaş.',
  SCAN_UNAVAILABLE: 'Tarama yalnızca hedef yörüngede başlatılabilir.',
};

function MissionCard({ mission, onAccept }: { mission: MissionInstance; onAccept: () => void }) {
  const typeLabel =
    mission.type === 'CARGO' ? '▣ KARGO' : mission.type === 'RECONNAISSANCE' ? '⌾ KEŞİF' : '◇ ÖNLEME';
  return (
    <article className="mission-card" data-testid={`mission-${mission.type.toLowerCase()}`}>
      <div className="mission-card-top">
        <span>{typeLabel}</span>
        <b>{mission.difficulty}</b>
      </div>
      <h3>{mission.title}</h3>
      <p>{mission.briefing}</p>
      <dl>
        <dt>HEDEF</dt>
        <dd>{mission.destination.name}</dd>
        <dt>TAHMİNİ ETA</dt>
        <dd>{duration(mission.estimatedEtaSeconds)}</dd>
        {mission.cargo && (
          <>
            <dt>KARGO KÜTLESİ</dt>
            <dd>{mission.cargo.massKg} kg</dd>
          </>
        )}
        <dt>ÖDÜL</dt>
        <dd>
          {mission.reward.credits.toLocaleString('tr-TR')} kr · +{mission.reward.reputation} itibar
        </dd>
      </dl>
      <button className="mission-accept" onClick={onAccept} disabled={!mission.reachable}>
        {mission.reachable ? 'GÖREVİ KABUL ET' : (mission.unavailableReason ?? 'ERİŞİLEMİYOR')}
      </button>
    </article>
  );
}

function ActiveMission({
  mission,
  atDestination,
  onNavigate,
  onDeliver,
  onScan,
  onIdentify,
  onAbandon,
}: {
  mission: MissionInstance;
  atDestination: boolean;
  onNavigate: () => void;
  onDeliver: () => void;
  onScan: () => void;
  onIdentify: () => void;
  onAbandon: () => void;
}) {
  const progress = mission.recon
    ? Math.min(100, (mission.recon.progressSeconds / mission.recon.requiredSeconds) * 100)
    : 0;
  return (
    <section className="active-mission" aria-label="Etkin görev">
      <div className="mission-card-top">
        <span>
          {mission.type === 'CARGO'
            ? '▣ AKTİF KARGO'
            : mission.type === 'RECONNAISSANCE'
              ? '⌾ AKTİF KEŞİF'
              : '◇ AKTİF ÖNLEME'}
        </span>
        <b>{mission.status}</b>
      </div>
      <h3>{mission.title}</h3>
      <p>{mission.briefing}</p>
      <div className={`destination-state ${atDestination ? 'ready' : ''}`}>
        <small>HEDEF</small>
        <strong>{mission.destination.name}</strong>
        <span>{atDestination ? 'HEDEF MENZİLİNDE' : 'TRANSFER GEREKİYOR'}</span>
      </div>
      {mission.cargo && (
        <div className="objective-status">
          <small>GÖREVE BAĞLI KARGO</small>
          <strong>
            {mission.cargo.name} · {mission.cargo.massKg} kg
          </strong>
          <span>{mission.cargo.delivered ? 'TESLİM EDİLDİ' : 'ARAÇTA KİLİTLİ'}</span>
        </div>
      )}
      {mission.recon && (
        <div className="scan-status">
          <small>TARAMA İLERLEMESİ</small>
          <strong>
            {mission.recon.progressSeconds.toFixed(1)} / {mission.recon.requiredSeconds.toFixed(0)} sn
          </strong>
          <div>
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      {!atDestination && (
        <button className="mission-navigate" onClick={onNavigate}>
          HEDEFİ MANEVRAYA AKTAR
        </button>
      )}
      {mission.type === 'CARGO' && (
        <button
          className="mission-complete"
          onClick={onDeliver}
          disabled={!atDestination}
          data-testid="deliver-cargo"
        >
          KARGOYU TESLİM ET
        </button>
      )}
      {mission.type === 'RECONNAISSANCE' && (
        <button
          className="mission-complete"
          onClick={onScan}
          disabled={!atDestination || mission.recon?.scanning}
          data-testid="start-scan"
        >
          {mission.recon?.scanning ? 'TARAMA SÜRÜYOR…' : 'TARAMAYI BAŞLAT'}
        </button>
      )}
      {mission.type === 'INTERCEPT' && (
        <button
          className="mission-complete"
          onClick={onIdentify}
          disabled={!atDestination || mission.intercept?.identified}
          data-testid="identify-target"
        >
          {mission.intercept?.identified ? 'HEDEF TANIMLANDI' : 'HEDEFİ TANIMLA'}
        </button>
      )}
      <button className="mission-abandon" onClick={onAbandon}>
        GÖREVİ TERK ET
      </button>
    </section>
  );
}

export function MissionPanel({
  open,
  state,
  pending,
  error,
  onClose,
  onFaction,
  onRefresh,
  onAccept,
  onNavigate,
  onDeliver,
  onScan,
  onIdentify,
  onAbandon,
}: {
  open: boolean;
  state?: WorldState;
  pending: boolean;
  error: string;
  onClose: () => void;
  onFaction: (faction: FactionId) => void;
  onRefresh: () => void;
  onAccept: (missionId: string) => void;
  onNavigate: (mission: MissionInstance) => void;
  onDeliver: (mission: MissionInstance) => void;
  onScan: (mission: MissionInstance) => void;
  onIdentify: (mission: MissionInstance) => void;
  onAbandon: (missionId: string) => void;
}) {
  if (!open) return null;
  const profile = state?.profile,
    faction = FACTIONS.find((item) => item.id === profile?.factionId),
    active = state?.missions.find((mission) => mission.id === profile?.activeMissionId),
    offers = state?.missions.filter((mission) => mission.status === 'AVAILABLE') ?? [],
    recent = [...(state?.missions ?? [])]
      .reverse()
      .find((mission) => ['COMPLETED', 'FAILED'].includes(mission.status)),
    atDestination = active
      ? Math.abs(
          length(state!.ship.position) - (CONFIG.earthRadius + active.destination.altitudeKm * 1000),
        ) <= active.destination.toleranceM
      : false;
  return (
    <aside className="mission-panel" aria-label="Görev kontrolü">
      <div className="maneuver-heading">
        <div>
          <div className="eyebrow">03 / GÖREV KONTROLÜ</div>
          <h2>Yörünge işleri</h2>
        </div>
        <button onClick={onClose} aria-label="Görev panelini kapat">
          ×
        </button>
      </div>
      {!faction ? (
        <section className="faction-select" aria-label="Fraksiyon seçimi">
          <p>Yerel pilot profilini bir hizmet ağına bağla.</p>
          {FACTIONS.map((item) => (
            <button
              key={item.id}
              onClick={() => onFaction(item.id)}
              data-testid={`faction-${item.id.toLowerCase()}`}
            >
              <i>{item.symbol}</i>
              <span>
                <strong>{item.name}</strong>
                <small>
                  {item.motto}
                  <br />
                  {item.homeLocationName}
                </small>
              </span>
            </button>
          ))}
        </section>
      ) : (
        <>
          <section className="profile-strip" aria-label="Pilot profili">
            <i>{faction.symbol}</i>
            <div>
              <small>FRAKSİYON</small>
              <strong>{faction.name}</strong>
            </div>
            <div>
              <small>KREDİ</small>
              <strong data-testid="profile-credits">{profile!.credits.toLocaleString('tr-TR')}</strong>
            </div>
            <div>
              <small>İTİBAR</small>
              <strong data-testid="profile-reputation">{profile!.reputation}</strong>
            </div>
          </section>
          {active ? (
            <ActiveMission
              mission={active}
              atDestination={atDestination}
              onNavigate={() => onNavigate(active)}
              onDeliver={() => onDeliver(active)}
              onScan={() => onScan(active)}
              onIdentify={() => onIdentify(active)}
              onAbandon={() => onAbandon(active.id)}
            />
          ) : (
            <section className="mission-offers" aria-label="Görev listesi">
              <div className="offer-heading">
                <span>NPC GÖREV HAVUZU</span>
                <button onClick={onRefresh} disabled={pending}>
                  {pending ? 'HESAPLANIYOR…' : 'YENİLE'}
                </button>
              </div>
              {offers.length ? (
                offers.map((mission) => (
                  <MissionCard key={mission.id} mission={mission} onAccept={() => onAccept(mission.id)} />
                ))
              ) : (
                <p className="empty-offers">
                  Planner erişilebilir rotaları doğruladıktan sonra görevler burada görünür.
                </p>
              )}
              {recent && (
                <div className={`mission-result ${recent.status.toLowerCase()}`} role="status">
                  <strong>{recent.status === 'COMPLETED' ? 'GÖREV TAMAMLANDI' : 'GÖREV BAŞARISIZ'}</strong>
                  <span>
                    {recent.title}
                    {recent.status === 'COMPLETED'
                      ? ` · +${recent.reward.credits} kredi · +${recent.reward.reputation} itibar`
                      : ''}
                  </span>
                </div>
              )}
            </section>
          )}
        </>
      )}
      {error && <p className="planner-error">{errorText[error] ?? error}</p>}
    </aside>
  );
}
