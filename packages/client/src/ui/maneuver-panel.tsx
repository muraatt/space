import {
  CONFIG,
  type ManeuverCandidate,
  type ManeuverCandidateType,
  type ManeuverExecutionState,
  type ManeuverPlanResult,
} from '@orbital/shared';

export interface OrbitTargetOption {
  id: string;
  name: string;
  altitudeKm: number;
  phaseAheadRad: number;
  relation: string;
}

export const ORBIT_TARGETS: OrbitTargetOption[] = [
  {
    id: 'service-800',
    name: 'SERVİS HALKASI A-800',
    altitudeKm: 800,
    phaseAheadRad: 0.13179322079005384,
    relation: '400 km yukarıda · yakın kalkış penceresi',
  },
  {
    id: 'inspection-450',
    name: 'YAKIN DENETİM YÖRÜNGESİ',
    altitudeKm: 450,
    phaseAheadRad: 0.02,
    relation: '50 km yukarıda · kısa transfer',
  },
  {
    id: 'phase-target',
    name: 'FAZ İŞARETİ P-03',
    altitudeKm: 400,
    phaseAheadRad: 0.3,
    relation: 'aynı yörünge · 17.2° ileride',
  },
];

const duration = (seconds: number) => {
  const rounded = Math.max(0, Math.round(seconds)),
    hours = Math.floor(rounded / 3600),
    minutes = Math.floor((rounded % 3600) / 60),
    secs = rounded % 60;
  return hours ? `${hours} sa ${minutes} dk` : minutes ? `${minutes} dk ${secs} sn` : `${secs} sn`;
};

const rejectionText: Record<string, string> = {
  INSUFFICIENT_PROPELLANT: 'Yakıt bu rota için yetersiz',
  INSUFFICIENT_DELTA_V: 'Kullanılabilir Δv yetersiz',
  INVALID_TARGET: 'Hedef geometrisi geçersiz',
  NO_FEASIBLE_TRANSFER: 'Uygun transfer bulunamadı',
  ARRIVAL_TOLERANCE_NOT_MET: 'Varış doğruluğu sağlanamadı',
  DUPLICATE_EXECUTION: 'Bu plan zaten yürütüldü',
  MANEUVER_ACTIVE: 'Etkin manevra tamamlanmadan yeni komut verilemez',
  UNKNOWN_PLAN: 'Plan süresi doldu; seçenekleri yeniden hesapla',
};

const stateText: Record<string, string> = {
  IDLE: 'HAZIR',
  PLANNED: 'PLANLANDI',
  EXECUTING_BURN: 'KALKIŞ YANMASI',
  COASTING: 'YÖRÜNGE TRANSFERİ',
  ARRIVAL_BURN: 'VARIŞ YANMASI',
  COMPLETE: 'MANEVRA TAMAMLANDI',
  CANCELLED: 'MANEVRA İPTAL EDİLDİ',
  FAILED: 'MANEVRA BAŞARISIZ',
};

function CandidateCard({
  candidate,
  selected,
  onSelect,
}: {
  candidate: ManeuverCandidate;
  selected: boolean;
  onSelect: () => void;
}) {
  const lowReserve = candidate.expectedReserveDeltaVMps < CONFIG.lowReserveDeltaVMps;
  return (
    <button
      className={`candidate-card ${selected ? 'selected' : ''}`}
      aria-pressed={selected}
      onClick={onSelect}
      data-testid={`candidate-${candidate.type.toLowerCase()}`}
    >
      <span className="candidate-name">{candidate.type}</span>
      <span>
        <small>ETA</small>
        {duration(candidate.etaSeconds)}
      </span>
      <span>
        <small>TOPLAM Δv</small>
        {candidate.estimatedDeltaVMps.toFixed(0)} m/s
      </span>
      <span>
        <small>YAKIT</small>
        {candidate.estimatedPropellantKg.toFixed(0)} kg
      </span>
      <span className={lowReserve ? 'warning' : ''}>
        <small>KALAN Δv</small>
        {candidate.expectedReserveDeltaVMps.toFixed(0)} m/s
      </span>
    </button>
  );
}

function PlanOrbitMap({ candidate, target }: { candidate: ManeuverCandidate; target: OrbitTargetOption }) {
  const raising = target.altitudeKm >= 400;
  return (
    <svg
      className="plan-orbit-map"
      viewBox="0 0 340 112"
      aria-label="Seçili transfer yörüngesi, ölçekli değildir"
    >
      <ellipse className="map-current-orbit" cx="170" cy="56" rx="70" ry="23" />
      <ellipse className="map-target-orbit" cx="170" cy="56" rx={raising ? 102 : 58} ry={raising ? 34 : 19} />
      <circle className="map-earth" cx="170" cy="56" r="17" />
      <path className="map-transfer" d={raising ? 'M240 56 Q176 5 68 56' : 'M240 56 Q184 22 112 56'} />
      <circle className="map-burn" cx="240" cy="56" r="3" />
      <circle className="map-arrival" cx={raising ? 68 : 112} cy="56" r="3" />
      <text x="8" y="13">
        SEÇİLİ ROTA · {candidate.type}
      </text>
      <text x="8" y="105">
        ● YANMA 1
      </text>
      <text x="268" y="105">
        VARIŞ ●
      </text>
    </svg>
  );
}

export function ManeuverPanel({
  open,
  target,
  plan,
  pending,
  selectedType,
  execution,
  error,
  onClose,
  onTarget,
  onPlan,
  onSelect,
  onExecute,
  onCancel,
}: {
  open: boolean;
  target: OrbitTargetOption;
  plan?: ManeuverPlanResult;
  pending: boolean;
  selectedType?: ManeuverCandidateType;
  execution?: ManeuverExecutionState;
  error: string;
  onClose: () => void;
  onTarget: (id: string) => void;
  onPlan: () => void;
  onSelect: (type: ManeuverCandidateType) => void;
  onExecute: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  const selected = plan?.candidates.find((candidate) => candidate.type === selectedType),
    active =
      execution && ['PLANNED', 'EXECUTING_BURN', 'COASTING', 'ARRIVAL_BURN'].includes(execution.status);
  return (
    <aside className="maneuver-panel" aria-label="Manevra bilgisayarı">
      <div className="maneuver-heading">
        <div>
          <div className="eyebrow">02 / MANEVRA BİLGİSAYARI</div>
          <h2>Yörünge transferi</h2>
        </div>
        <button onClick={onClose} aria-label="Manevra panelini kapat">
          ×
        </button>
      </div>
      <label className="target-select">
        <span>HEDEF YÖRÜNGE</span>
        <select value={target.id} onChange={(event) => onTarget(event.target.value)} disabled={!!active}>
          {ORBIT_TARGETS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <small>{target.relation}</small>
      </label>
      <button className="plan-action" onClick={onPlan} disabled={pending || !!active}>
        {pending ? 'ÇÖZÜMLER HESAPLANIYOR…' : 'MANEVRA SEÇENEKLERİNİ HESAPLA'}
      </button>
      {plan && (
        <section className="candidate-list" aria-label="Manevra seçenekleri">
          {plan.candidates.map((candidate) => (
            <CandidateCard
              key={candidate.type}
              candidate={candidate}
              selected={selectedType === candidate.type}
              onSelect={() => onSelect(candidate.type)}
            />
          ))}
          {plan.rejected.map((rejection) => (
            <div className="candidate-unavailable" key={rejection.type}>
              <strong>{rejection.type}</strong>
              <span>{rejectionText[rejection.reason] ?? rejection.reason}</span>
            </div>
          ))}
        </section>
      )}
      {selected && <PlanOrbitMap candidate={selected} target={target} />}
      {selected && !active && (
        <div className="selection-summary">
          <span>
            Seçili plan <strong>{selected.type}</strong>
          </span>
          <span>
            {selected.estimatedPropellantKg.toFixed(0)} kg yakıt ·{' '}
            {duration(selected.transferDurationSeconds)} transfer
          </span>
          {selected.expectedReserveDeltaVMps < CONFIG.lowReserveDeltaVMps && (
            <b>UYARI · Varış rezervi {selected.expectedReserveDeltaVMps.toFixed(0)} m/s</b>
          )}
          <button className="execute-action" onClick={onExecute} data-testid="execute-maneuver">
            PLANI YÜRÜT
          </button>
        </div>
      )}
      {execution && (
        <div className={`maneuver-status status-${execution.status.toLowerCase()}`} role="status">
          <small>OTORİTER MANEVRA DURUMU</small>
          <strong>{stateText[execution.status]}</strong>
          {execution.nextEventAtMs && (
            <span>Sonraki olay: {duration((execution.nextEventAtMs - execution.updatedAtMs) / 1000)}</span>
          )}
          {active && (
            <button onClick={onCancel} data-testid="cancel-maneuver">
              MANEVRAYI İPTAL ET
            </button>
          )}
        </div>
      )}
      {error && <p className="planner-error">{rejectionText[error] ?? error}</p>}
    </aside>
  );
}
