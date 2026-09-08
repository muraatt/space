import {
  CONFIG,
  UPGRADE_DEFINITIONS,
  shipDefinition,
  type ShipState,
  type WorldState,
} from '@orbital/shared';
import { availableDeltaV } from '@orbital/simulation';

const errors: Record<string, string> = {
  DUPLICATE_TRANSACTION: 'Bu işlem kimliği daha önce işlendi.',
  INSUFFICIENT_CREDITS: 'Bu işlem için kredi yetersiz.',
  FUEL_OVERFILL: 'Yakıt miktarı tank kapasitesini aşıyor.',
  AMMUNITION_OVERFILL: 'Mühimmat miktarı kapasiteyi aşıyor.',
  AMMUNITION_INCOMPATIBLE: 'Bu araçta mühimmat deposu yok.',
  NO_REPAIR_NEEDED: 'Araç zaten tam servis durumunda.',
  UPGRADE_ALREADY_INSTALLED: 'Bu yükseltme zaten kurulu.',
  UPGRADE_INCOMPATIBLE: 'Yükseltme bu araçla uyumlu değil.',
  UPGRADE_SLOT_FULL: 'Uygun modül yuvası dolu.',
  MISSION_ACTIVE: 'Etkin görev sırasında hangar işlemi yapılamaz.',
  MANEUVER_ACTIVE: 'Etkin manevra sırasında hangar işlemi yapılamaz.',
  SERVICE_UNAVAILABLE: 'Servis için bir yörünge merkezinde bulunmalısın.',
  SHIP_ALREADY_ACTIVE: 'Bu araç zaten aktif.',
};

function ShipCard({ ship, active, onSelect }: { ship: ShipState; active: boolean; onSelect: () => void }) {
  const definition = shipDefinition(ship.definitionId),
    deltaV = availableDeltaV(ship.mass, ship.performance.specificImpulseSeconds);
  return (
    <article className={`hangar-ship-card ${active ? 'active' : ''}`} data-testid={`ship-${ship.id}`}>
      <div className="ship-identity">
        <i>{definition.symbol}</i>
        <span>
          <small>{definition.role === 'LOGISTICS' ? 'LOJİSTİK' : 'DEVRİYE'}</small>
          <strong>{definition.name}</strong>
          <em>{definition.callsign}</em>
        </span>
      </div>
      <p>{definition.description}</p>
      <dl>
        <dt>KURU KÜTLE</dt>
        <dd>{ship.performance.dryMassKg.toLocaleString('tr-TR')} kg</dd>
        <dt>ANA İTKİ</dt>
        <dd>{(ship.performance.mainThrustN / 1000).toFixed(1)} kN</dd>
        <dt>MEVCUT Δv</dt>
        <dd>{deltaV.toFixed(0)} m/s</dd>
        <dt>KARGO</dt>
        <dd>{ship.performance.cargoCapacityKg} kg</dd>
        <dt>DAYANIKLILIK</dt>
        <dd>{ship.performance.durabilityRating}</dd>
      </dl>
      <button onClick={onSelect} disabled={active} data-testid={`select-${ship.id}`}>
        {active ? 'AKTİF ARAÇ' : 'AKTİF ARACI DEĞİŞTİR'}
      </button>
    </article>
  );
}

export function HangarPanel({
  open,
  state,
  error,
  onClose,
  onSelectShip,
  onFuel,
  onRepair,
  onAmmunition,
  onUpgrade,
}: {
  open: boolean;
  state?: WorldState;
  error: string;
  onClose: () => void;
  onSelectShip: (shipId: string) => void;
  onFuel: (amountKg: number) => void;
  onRepair: () => void;
  onAmmunition: (amountKg: number) => void;
  onUpgrade: (upgradeId: string) => void;
}) {
  if (!open || !state) return null;
  const ship = state.ship,
    definition = shipDefinition(ship.definitionId),
    fuelMissing = Math.max(0, ship.performance.propellantCapacityKg - ship.mass.propellantKg),
    ammoMissing = Math.max(0, ship.performance.ammunitionCapacityKg - ship.mass.ammunitionKg),
    repairMissing = Math.max(0, 100 - ship.conditionPercent),
    fuelCost = Math.ceil(fuelMissing * CONFIG.fuelCreditsPerKg),
    ammoCost = Math.ceil(ammoMissing * CONFIG.ammunitionCreditsPerKg),
    repairCost = Math.ceil(repairMissing * CONFIG.repairCreditsPerPercent),
    activeMission = !!state.profile.activeMissionId,
    activeManeuver =
      !!state.maneuver &&
      ['PLANNED', 'EXECUTING_BURN', 'COASTING', 'ARRIVAL_BURN'].includes(state.maneuver.status),
    blocked = activeMission || activeManeuver;
  return (
    <aside className="hangar-panel" aria-label="Hangar ve servisler">
      <div className="maneuver-heading">
        <div>
          <div className="eyebrow">03 / YÖRÜNGE HANGARI</div>
          <h2>Araç ve servis</h2>
        </div>
        <button onClick={onClose} aria-label="Hangarı kapat">
          [X]
        </button>
      </div>
      <section className="hangar-balance">
        <span>KULLANILABİLİR BAKİYE</span>
        <strong data-testid="hangar-credits">{state.profile.credits.toLocaleString('tr-TR')} kredi</strong>
      </section>
      <section className="hangar-fleet" aria-label="Sahip olunan araçlar">
        {state.hangar.ships.map((owned) => (
          <ShipCard
            key={owned.id}
            ship={owned}
            active={owned.id === state.profile.activeShipId}
            onSelect={() => onSelectShip(owned.id)}
          />
        ))}
      </section>
      <section className="service-grid" aria-label="Servisler">
        <div className="service-heading">
          <span>AKTİF SERVİS · {definition.name}</span>
          <b>{blocked ? 'İŞLEM KİLİTLİ' : 'YÖRÜNGE MERKEZİ'}</b>
        </div>
        <article data-testid="fuel-service">
          <small>YAKIT</small>
          <strong>
            {ship.mass.propellantKg.toFixed(0)} / {ship.performance.propellantCapacityKg.toFixed(0)} kg
          </strong>
          <span>
            {fuelMissing.toFixed(0)} kg dolum · {fuelCost} kredi
          </span>
          <button disabled={blocked || fuelMissing <= 0} onClick={() => onFuel(fuelMissing)}>
            YAKITI TAMAMLA
          </button>
        </article>
        <article data-testid="repair-service">
          <small>SERVİS DURUMU</small>
          <strong>%{ship.conditionPercent.toFixed(0)}</strong>
          <span>
            %{repairMissing.toFixed(0)} onarım · {repairCost} kredi
          </span>
          <button disabled={blocked || repairMissing <= 0} onClick={onRepair}>
            ARACI ONAR
          </button>
        </article>
        <article data-testid="ammo-service">
          <small>MÜHİMMAT REZERVİ</small>
          <strong>
            {ship.mass.ammunitionKg.toFixed(0)} / {ship.performance.ammunitionCapacityKg.toFixed(0)} kg
          </strong>
          <span>
            {ammoMissing.toFixed(0)} kg ikmal · {ammoCost} kredi
          </span>
          <button
            disabled={blocked || ammoMissing <= 0 || ship.performance.ammunitionCapacityKg <= 0}
            onClick={() => onAmmunition(ammoMissing)}
          >
            MÜHİMMATI TAMAMLA
          </button>
        </article>
      </section>
      <section className="upgrade-list" aria-label="Yükseltmeler">
        <div className="service-heading">
          <span>SABİT MODÜL KATALOĞU · 4</span>
          <b>{ship.installedUpgradeIds.length} KURULU</b>
        </div>
        {UPGRADE_DEFINITIONS.map((upgrade) => {
          const installed = ship.installedUpgradeIds.includes(upgrade.id),
            compatible = upgrade.compatibleShips.includes(ship.definitionId),
            used = ship.installedUpgradeIds.filter(
              (id) => UPGRADE_DEFINITIONS.find((item) => item.id === id)?.slot === upgrade.slot,
            ).length,
            slotFree = used < ship.performance.slots[upgrade.slot];
          return (
            <article className="upgrade-card" key={upgrade.id} data-testid={`upgrade-${upgrade.id}`}>
              <div>
                <small>{upgrade.slot}</small>
                <strong>{upgrade.name}</strong>
                <p>{upgrade.description}</p>
                <em>{upgrade.effectLabel}</em>
              </div>
              <button
                disabled={
                  blocked ||
                  installed ||
                  !compatible ||
                  !slotFree ||
                  state.profile.credits < upgrade.priceCredits
                }
                onClick={() => onUpgrade(upgrade.id)}
              >
                {installed
                  ? 'KURULU'
                  : !compatible
                    ? 'UYUMSUZ'
                    : !slotFree
                      ? 'YUVA DOLU'
                      : `${upgrade.priceCredits.toLocaleString('tr-TR')} KR · KUR`}
              </button>
            </article>
          );
        })}
      </section>
      {error && <p className="planner-error">{errors[error] ?? error}</p>}
      <p className="hangar-limit">
        Onarım gövde ve dört savaş alt sistemini birlikte yeniler. İmha edilen araç önce sigorta
        akışından kurtarılmalıdır.
      </p>
    </aside>
  );
}
