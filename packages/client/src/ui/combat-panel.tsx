import { CONFIG, type WorldState } from '@orbital/shared';

const errors: Record<string, string> = {
  COMBAT_FORBIDDEN_SAFE: 'GÜVENLİ BÖLGE: saldırı komutu reddedildi.',
  COMBAT_PERMISSION_REQUIRED: 'NORMAL BÖLGE: görev veya karşılıklı çatışma yetkisi gerekli.',
  UNKNOWN_TARGET: 'Hedef sunucu dünyasında bulunamadı.',
  SELF_TARGET: 'Kendi aracın hedeflenemez.',
  TARGET_INELIGIBLE: 'Temas savaş hedefi olmaya uygun değil.',
  NO_TARGET: 'Önce geçerli bir hedef seç.',
  TARGET_OUT_OF_RANGE: 'Hedef silah menzilinin dışında.',
  NO_LINE_OF_SIGHT: 'Dünya veya engel görüş hattını kapatıyor.',
  TARGET_OUTSIDE_ARC: 'Hedef ön ateş konisinin dışında.',
  LASER_COOLDOWN: 'Lazer yeniden çevrimde.',
  LASER_ENERGY_LOW: 'Lazer için enerji yetersiz.',
  LASER_OVERHEAT: 'Lazer ısı bütçesi aşıldı.',
  MISSILE_COOLDOWN: 'Füze lançeri yeniden çevrimde.',
  MISSILE_AMMUNITION_LOW: 'Güdümlü füze için mühimmat yetersiz.',
  COUNTERMEASURE_COOLDOWN: 'Karşı tedbir yeniden çevrimde.',
  COUNTERMEASURE_EMPTY: 'Karşı tedbir stoğu tükendi.',
  DUPLICATE_COMBAT_COMMAND: 'Tekrarlanan savaş komutu reddedildi.',
  SHIP_DESTROYED: 'Araç imha edildi; kurtarma işlemi gerekli.',
  WEAPON_OFFLINE: 'Silah alt sistemi devre dışı.',
  DUPLICATE_TRANSACTION: 'Bu sigorta talebi daha önce işlendi.',
  NO_RECOVERY_PENDING: 'Bekleyen sigorta talebi yok.',
};

const seconds = (until: number, now: number) => Math.max(0, (until - now) / 1000);

export function CombatPanel({
  open,
  state,
  error,
  onClose,
  onSelect,
  onClear,
  onLaser,
  onMissile,
  onCountermeasure,
  onRecover,
  onReturnHangar,
}: {
  open: boolean;
  state?: WorldState;
  error: string;
  onClose: () => void;
  onSelect: (targetId: string) => void;
  onClear: () => void;
  onLaser: () => void;
  onMissile: () => void;
  onCountermeasure: () => void;
  onRecover: () => void;
  onReturnHangar: () => void;
}) {
  if (!open || !state) return null;
  const combat = state.combat,
    contact = combat.contacts[0],
    selected = combat.contacts.find((item) => item.id === combat.selectedTargetId),
    now = combat.serverNowMs,
    laserCooldown = seconds(combat.laserCooldownUntilMs, now),
    missileCooldown = seconds(combat.missileCooldownUntilMs, now),
    countermeasureCooldown = seconds(combat.countermeasureCooldownUntilMs, now),
    incoming = combat.missiles.filter(
      (missile) => missile.status === 'ACTIVE' && missile.targetId === state.ship.id,
    ),
    outgoing = combat.missiles.filter(
      (missile) => missile.status === 'ACTIVE' && missile.sourceId === state.ship.id,
    ),
    tagged = combat.combatTagUntilMs > now;
  const wreck = combat.recovery
    ? combat.wrecks.find((item) => item.id === combat.recovery!.wreckId)
    : undefined;
  return (
    <aside className="combat-panel" aria-label="Savaş kontrolü">
      <div className="maneuver-heading">
        <div>
          <div className="eyebrow">04 / ATEŞ KONTROLÜ</div>
          <h2>Temas yönetimi</h2>
        </div>
        <button onClick={onClose} aria-label="Savaş panelini kapat">
          [X]
        </button>
      </div>

      {combat.recovery && (
        <section className={`recovery-card ${combat.recovery.status.toLowerCase()}`} data-testid="recovery-card">
          <small>{combat.recovery.status === 'PENDING' ? 'ARAÇ KAYBI' : 'SİGORTA SONUCU'}</small>
          <strong>
            {combat.recovery.status === 'PENDING' ? 'GEMİ İMHA EDİLDİ' : 'YEDEK ARAÇ TESLİM EDİLDİ'}
          </strong>
          <p>
            {wreck?.cargoLostKg.toFixed(0) ?? 0} kg kargo · {wreck?.ammunitionLostKg.toFixed(0) ?? 0} kg
            mühimmat · {wreck?.upgradeIdsLost.length ?? 0} modül kayıp
          </p>
          <span>
            {combat.recovery.deductibleCredits} kredi muafiyet · yetersiz bakiyede temel Kestrel garantisi
          </span>
          {combat.recovery.status === 'PENDING' ? (
            <button data-testid="claim-replacement" onClick={onRecover}>
              SİGORTA / YEDEK ARAÇ TALEP ET
            </button>
          ) : (
            <button data-testid="return-hangar" onClick={onReturnHangar}>
              HANGARA DÖN
            </button>
          )}
        </section>
      )}

      <section className={`combat-region region-${combat.region.toLowerCase()}`}>
        <small>BÖLGE KURALI</small>
        <strong data-testid="combat-region">{combat.region}</strong>
        <span>
          {combat.region === 'SAFE'
            ? 'Silah kullanımı kilitli.'
            : combat.region === 'NORMAL'
              ? 'Geçerli görev ateş yetkisi gerekir.'
              : 'Serbest çatışma bölgesi.'}
        </span>
        <b>{tagged ? 'COMBAT TAG ETKİN' : 'COMBAT TAG YOK'}</b>
      </section>

      <section className="contact-card" aria-label="Hedef teması">
        <div>
          <small>TAKTİK TEMAS</small>
          <strong>{contact.label}</strong>
          <span>{contact.id}</span>
        </div>
        <dl>
          <dt>MENZİL</dt>
          <dd data-testid="target-range">{contact.rangeM.toFixed(0)} m</dd>
          <dt>GÖRÜŞ HATTI</dt>
          <dd>{contact.lineOfSight ? 'AÇIK' : 'KAPALI'}</dd>
          <dt>ATEŞ YETKİSİ</dt>
          <dd>{contact.engagementAllowed ? 'VERİLDİ' : 'YOK'}</dd>
          <dt>GÖVDE</dt>
          <dd>
            {contact.health.toFixed(0)} / {contact.maxHealth.toFixed(0)}
          </dd>
        </dl>
        {selected ? (
          <button data-testid="clear-target" onClick={onClear} disabled={combat.playerDestroyed}>
            HEDEFİ BIRAK
          </button>
        ) : (
          <button
            data-testid="select-target"
            onClick={() => onSelect(contact.id)}
            disabled={combat.playerDestroyed || !contact.eligible || contact.destroyed}
          >
            HEDEFİ SEÇ
          </button>
        )}
      </section>

      {incoming.length > 0 && (
        <div className="incoming-warning" role="alert" data-testid="incoming-missile">
          GELEN FÜZE · {incoming.length} AKTİF
        </div>
      )}

      <section className="weapon-grid">
        <article data-testid="laser-weapon">
          <small>LAZER / L-1</small>
          <strong>{laserCooldown > 0 ? `${laserCooldown.toFixed(1)} sn` : 'HAZIR'}</strong>
          <span>
            Enerji %{combat.laserEnergy.toFixed(0)} · Isı %{combat.laserHeat.toFixed(0)}
          </span>
          <button
            onClick={onLaser}
            disabled={!selected || laserCooldown > 0 || combat.playerDestroyed || combat.modules.WEAPON.condition < 25}
          >
            LAZER ATEŞLE
          </button>
        </article>
        <article data-testid="missile-weapon">
          <small>GÜDÜMLÜ FÜZE / M-1</small>
          <strong>{missileCooldown > 0 ? `${missileCooldown.toFixed(1)} sn` : 'KİLİT HAZIR'}</strong>
          <span>
            {state.ship.mass.ammunitionKg.toFixed(0)} kg · {outgoing.length} uçuşta
          </span>
          <button
            onClick={onMissile}
            disabled={
              !selected ||
              missileCooldown > 0 ||
              state.ship.mass.ammunitionKg < CONFIG.missileMassKg ||
              combat.playerDestroyed ||
              combat.modules.WEAPON.condition < 25
            }
          >
            FÜZE FIRLAT
          </button>
        </article>
        <article data-testid="countermeasure">
          <small>KARŞI TEDBİR / CM-1</small>
          <strong>{countermeasureCooldown > 0 ? `${countermeasureCooldown.toFixed(1)} sn` : 'HAZIR'}</strong>
          <span>
            {combat.countermeasureCharges} yük · {incoming.length} tehdit
          </span>
          <button
            onClick={onCountermeasure}
            disabled={countermeasureCooldown > 0 || combat.countermeasureCharges <= 0 || combat.playerDestroyed}
          >
            KARŞI TEDBİR
          </button>
        </article>
      </section>

      <section className="combat-hull">
        <small>ARAÇ GÖVDESİ</small>
        <strong>%{combat.playerHull.toFixed(0)}</strong>
        <div>
          <span style={{ width: `${combat.playerHull}%` }} />
        </div>
      </section>
      <section className="module-status" aria-label="Alt sistem durumu">
        {Object.values(combat.modules).map((module) => (
          <article key={module.id} data-testid={`module-${module.id.toLowerCase()}`}>
            <small>{module.id}</small>
            <strong>%{module.condition.toFixed(0)}</strong>
            <span>{module.consequence}</span>
          </article>
        ))}
      </section>
      <section className="combat-log" aria-label="Savaş olayları">
        <small>OTORİTER OLAY AKIŞI</small>
        {[...combat.events]
          .slice(-5)
          .reverse()
          .map((event) => (
            <p key={event.id}>
              <b>{event.type.replaceAll('_', ' ')}</b>
              {event.message}
            </p>
          ))}
      </section>
      {error && <p className="planner-error">{errors[error] ?? error}</p>}
    </aside>
  );
}
