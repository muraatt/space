import { useEffect, useRef, useState } from 'react';
import {
  CONFIG,
  SCENES,
  shipDefinition,
  type ManeuverCandidateType,
  type ManeuverPlanResult,
  type SceneId,
  type FactionId,
  type MissionInstance,
  type WorldState,
  type ServerMetrics,
} from '@orbital/shared';
import { availableDeltaV, dot, length, normalize } from '@orbital/simulation';
import { Connection } from './net/connection';
import { FlightControls } from './input/flight-controls';
import { GameRenderer } from './render/renderer';
import { installTestBridge } from './debug/test-bridge';
import { DebugHud } from './ui/debug-hud';
import { ManeuverPanel, ORBIT_TARGETS } from './ui/maneuver-panel';
import { MissionPanel } from './ui/mission-panel';
import { HangarPanel } from './ui/hangar-panel';
import './styles.css';
type View = {
  state?: WorldState;
  metrics: ReturnType<GameRenderer['metrics']> | null;
  server?: ServerMetrics;
  status: string;
  rtt: number;
  error: string;
  plan?: ManeuverPlanResult;
  planId: string;
  planPending: boolean;
  missionPending: boolean;
};
function OrbitMark() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="11" />
      <ellipse cx="20" cy="20" rx="21" ry="6" transform="rotate(-38 20 20)" />
      <circle cx="30" cy="12" r="2" className="mark-dot" />
    </svg>
  );
}
function OrbitDiagram({ altitudeKm }: { altitudeKm: number }) {
  return (
    <svg className="orbit-diagram" viewBox="0 0 230 125" aria-label="Yörünge şeması, ölçekli değildir">
      <defs>
        <radialGradient id="orb">
          <stop stopColor="#354c5d" />
          <stop offset="1" stopColor="#142733" />
        </radialGradient>
      </defs>
      <ellipse cx="115" cy="65" rx="99" ry="35" transform="rotate(-20 115 65)" />
      <circle cx="115" cy="65" r="29" fill="url(#orb)" />
      <path d="M91 60Q115 71 138 54M106 39Q98 68 119 91" className="globe-line" />
      <circle cx="196" cy="29" r="4" className="ship-dot" />
      <path d="M196 29L219 10" />
      <text x="7" y="121">
        ECI / DÜNYA
      </text>
      <text x="150" y="121">
        {altitudeKm.toFixed(0)} km
      </text>
    </svg>
  );
}
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null),
    engine = useRef<{ renderer: GameRenderer; controls: FlightControls; connection: Connection } | null>(
      null,
    );
  const [view, setView] = useState<View>({
    metrics: null,
    status: 'Bağlanıyor',
    rtt: 0,
    error: '',
    planId: '',
    planPending: false,
    missionPending: false,
  });
  const [ready, setReady] = useState(false),
    [active, setActive] = useState(false),
    [help, setHelp] = useState(false),
    [credits, setCredits] = useState(false),
    [debug, setDebug] = useState(false),
    [plannerOpen, setPlannerOpen] = useState(false),
    [missionOpen, setMissionOpen] = useState(false),
    [hangarOpen, setHangarOpen] = useState(false),
    [targetId, setTargetId] = useState('service-800'),
    [selectedType, setSelectedType] = useState<ManeuverCandidateType>();
  const params = new URLSearchParams(location.search),
    requestedScene = params.get('scene'),
    scene: SceneId = SCENES.includes(requestedScene as SceneId) ? (requestedScene as SceneId) : 'orbit_day';
  const forceWebGL = params.get('backend') === 'webgl2';
  useEffect(() => {
    const canvas = canvasRef.current!;
    let renderer: GameRenderer | undefined;
    const connection = new Connection();
    let controls: FlightControls | undefined;
    let disposeBridge: (() => void) | undefined;
    let alive = true;
    let frame = 0;
    let inputTimer: ReturnType<typeof setInterval> | undefined,
      uiTimer: ReturnType<typeof setInterval> | undefined;
    async function start() {
      try {
        const gpu = (
          navigator as Navigator & {
            gpu?: { requestAdapter(options: { powerPreference: string }): Promise<unknown> };
          }
        ).gpu;
        const adapter = forceWebGL
          ? null
          : await gpu?.requestAdapter({ powerPreference: 'high-performance' }).catch(() => null);
        if (!alive) return;
        renderer = new GameRenderer(canvas, forceWebGL || !adapter);
        await renderer.init();
        if (!alive) {
          renderer.dispose();
          return;
        }
        controls = new FlightControls(canvas, renderer.camera.reset);
        engine.current = { renderer, controls, connection };
        connection.connect(scene);
        disposeBridge = installTestBridge(renderer, connection);
        inputTimer = setInterval(() => {
          if (connection.flightInputAllowed()) connection.input(controls!.read());
        }, 1000 / CONFIG.inputHz);
        uiTimer = setInterval(() => {
          if (alive)
            setView({
              state: connection.snapshot?.state,
              metrics: renderer!.metrics(),
              server: connection.snapshot?.metrics,
              status: connection.status,
              rtt: connection.rttMs,
              error: connection.lastError,
              plan: connection.plan,
              planId: connection.planId,
              planPending: connection.planPending,
              missionPending: connection.missionPending,
            });
        }, 250);
        let shown = false;
        const loop = (now: number) => {
          if (!alive) return;
          if (connection.snapshot && connection.status === 'Bağlı') {
            renderer!.render(connection.snapshot.state, now);
            if (!shown) {
              shown = true;
              setReady(true);
            }
          }
          frame = requestAnimationFrame(loop);
        };
        frame = requestAnimationFrame(loop);
      } catch (error) {
        if (alive) setView((v) => ({ ...v, error: String(error), status: 'Başlatma hatası' }));
      }
    }
    void start();
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      clearInterval(inputTimer);
      clearInterval(uiTimer);
      controls?.dispose();
      connection.dispose();
      disposeBridge?.();
      if (renderer?.ready) renderer.dispose();
      engine.current = null;
    };
  }, [scene, forceWebGL]);
  useEffect(() => {
    if (scene === 'orbit_maneuver' || scene === 'low_fuel') setPlannerOpen(true);
    if (scene === 'cargo_mission') setMissionOpen(true);
  }, [scene]);
  useEffect(() => {
    if (!selectedType && view.plan?.candidates[0]) setSelectedType(view.plan.candidates[0].type);
  }, [selectedType, view.plan]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'F3') {
        e.preventDefault();
        setDebug((v) => !v);
      }
      if (e.code === 'Escape') {
        setHelp(false);
        setCredits(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  const takeControl = () => {
    if (engine.current) {
      if (engine.current.connection.status === 'Kumanda başka sekmede')
        engine.current.connection.connect(scene);
      engine.current.controls.enabled = true;
      setActive(true);
      canvasRef.current?.focus();
    }
  };
  const resetCamera = () => {
    engine.current?.renderer.camera.reset();
    canvasRef.current?.focus();
  };
  const state = view.state,
    activeDefinition = state ? shipDefinition(state.ship.definitionId) : undefined,
    alt = state ? (length(state.ship.position) - CONFIG.earthRadius) / 1000 : 400,
    speed = state ? length(state.ship.velocity) / 1000 : 0,
    radial = state ? dot(state.ship.velocity, normalize(state.ship.position)) : 0,
    propellant = state?.ship.mass.propellantKg ?? CONFIG.initialPropellantKg,
    propellantPercent = state ? (propellant / state.ship.performance.propellantCapacityKg) * 100 : 0,
    shipDeltaV = state ? availableDeltaV(state.ship.mass, state.ship.performance.specificImpulseSeconds) : 0,
    target = ORBIT_TARGETS.find((option) => option.id === targetId) ?? ORBIT_TARGETS[0],
    selectedCandidate =
      state?.maneuver?.candidate ??
      view.plan?.candidates.find((candidate) => candidate.type === selectedType),
    maneuverStatus = state?.maneuver?.status ?? 'IDLE';
  useEffect(() => {
    engine.current?.renderer.setManeuverVisual(
      plannerOpen ? CONFIG.earthRadius + target.altitudeKm * 1000 : undefined,
      plannerOpen ? selectedCandidate : undefined,
    );
  }, [plannerOpen, selectedCandidate, target.altitudeKm]);
  const elapsed = Math.floor((state?.tick ?? 0) * CONFIG.fixedDt),
    clock = `${String(Math.floor(elapsed / 3600)).padStart(2, '0')}:${String(Math.floor(elapsed / 60) % 60).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  const goScene = (night: boolean) => {
    const p = new URLSearchParams(location.search);
    p.set('scene', night ? 'orbit_night' : 'orbit_day');
    location.search = p.toString();
  };
  const requestPlan = () => {
    setSelectedType(undefined);
    engine.current?.connection.requestPlan({
      kind: 'CIRCULAR_ORBIT',
      radiusM: CONFIG.earthRadius + target.altitudeKm * 1000,
      phaseAheadRad: target.phaseAheadRad,
    });
  };
  const chooseTarget = (id: string) => {
    setTargetId(id);
    setSelectedType(undefined);
    if (engine.current) engine.current.connection.plan = undefined;
  };
  const executePlan = () => {
    if (selectedType) engine.current?.connection.execute(selectedType);
  };
  const cancelPlan = () => {
    const executionId = state?.maneuver?.executionId;
    if (executionId) engine.current?.connection.cancel(executionId);
  };
  const openPlanner = () => {
    setMissionOpen(false);
    setHangarOpen(false);
    setPlannerOpen(true);
  };
  const openMissions = () => {
    setPlannerOpen(false);
    setHangarOpen(false);
    setMissionOpen(true);
  };
  const openHangar = () => {
    setPlannerOpen(false);
    setMissionOpen(false);
    setHangarOpen(true);
  };
  const navigateMission = (mission: MissionInstance) => {
    const matching = ORBIT_TARGETS.find((option) => option.altitudeKm === mission.destination.altitudeKm);
    if (matching) chooseTarget(matching.id);
    openPlanner();
  };
  return (
    <main className="app-shell">
      <canvas ref={canvasRef} className="flight-canvas" aria-label="Uçuş görünümü" tabIndex={0} />
      <div className="screen-vignette" />
      <header className="topbar">
        <div className="brand">
          <OrbitMark />
          <div>
            ORBITAL<span>EARTH OPERATIONS</span>
          </div>
        </div>
        <nav aria-label="Ana menü">
          <span className="nav-current">UÇUŞ GÜVERTESİ</span>
          <button onClick={() => setHelp(true)}>
            KONTROLLER <span>↗</span>
          </button>
          <button onClick={() => setCredits(true)}>KAYNAKLAR</button>
        </nav>
        <div className="connection">
          <i className={view.status === 'Bağlı' ? 'live' : ''} />
          <div>
            {view.status}
            <small>YEREL EVREN · {view.rtt.toFixed(0)} ms</small>
          </div>
          <span className="version">01.0</span>
        </div>
      </header>
      <aside className="left-rail">
        <div className="eyebrow">
          <span className="amber-dot" /> SERBEST UÇUŞ / 01
        </div>
        <h1>
          Dünya
          <br />
          yörüngesi<span>.</span>
        </h1>
        <p className="intro">
          Bir sonraki ufuk,
          <br />
          ilk manevrayla başlar.
        </p>
        <section className="vehicle-card">
          <div className="section-label">
            AKTİF ARAÇ <span>{activeDefinition?.callsign ?? '—'}</span>
          </div>
          <h2>{activeDefinition?.name ?? 'Bağlanıyor'}</h2>
          <p>{activeDefinition?.role === 'COMBAT' ? 'Yörünge devriye aracı' : 'Yörünge servis aracı'}</p>
          <div className="vehicle-meta">
            <span>12 m GÖVDE</span>
            <span>{state ? `${state.ship.massKg.toFixed(0)} kg` : 'KÜTLE'}</span>
          </div>
          <OrbitDiagram altitudeKm={alt} />
          <div className="orbit-numbers">
            <div>
              <small>İRTİFA</small>
              <strong>
                {alt.toFixed(1)}
                <em> km</em>
              </strong>
            </div>
            <div>
              <small>YÖRÜNGE HIZI</small>
              <strong>
                {speed.toFixed(3)}
                <em> km/s</em>
              </strong>
            </div>
          </div>
        </section>
        <section className="scene-control">
          <div className="section-label">GÖRÜŞ KOŞULU</div>
          <div className="segmented">
            <button aria-pressed={scene === 'orbit_day'} onClick={() => goScene(false)}>
              ☀ Gündüz
            </button>
            <button aria-pressed={scene === 'orbit_night'} onClick={() => goScene(true)}>
              ◐ Gece
            </button>
          </div>
          <p className="fine">Test sahnesi değişince uçuş sıfırlanır.</p>
        </section>
        <button className="primary-action" disabled={!ready} onClick={takeControl}>
          {active ? 'UÇUŞA ODAKLAN' : 'KUMANDAYI DEVRAL'}
          <span>↗</span>
        </button>
        <button className="planner-toggle" disabled={!ready} onClick={openPlanner}>
          MANEVRA BİLGİSAYARI <span>⌁</span>
        </button>
        <button className="mission-toggle" disabled={!ready} onClick={openMissions}>
          GÖREV KONTROLÜ <span>▣</span>
        </button>
        <button className="mission-toggle" disabled={!ready} onClick={openHangar}>
          HANGAR VE SERVİS <span>◇</span>
        </button>
        <p className="scope-note">
          OTURUM 3 · Görev operasyonları
          <br />
          İlerleme bu oturumda kalıcı değildir.
        </p>
      </aside>
      <ManeuverPanel
        open={plannerOpen}
        target={target}
        plan={view.plan}
        pending={view.planPending}
        selectedType={selectedType}
        execution={state?.maneuver}
        error={view.error}
        onClose={() => setPlannerOpen(false)}
        onTarget={chooseTarget}
        onPlan={requestPlan}
        onSelect={setSelectedType}
        onExecute={executePlan}
        onCancel={cancelPlan}
      />
      <MissionPanel
        open={missionOpen}
        state={state}
        pending={view.missionPending}
        error={view.error}
        onClose={() => setMissionOpen(false)}
        onFaction={(faction: FactionId) => engine.current?.connection.chooseFaction(faction)}
        onRefresh={() => engine.current?.connection.requestMissions()}
        onAccept={(missionId) => engine.current?.connection.acceptMission(missionId)}
        onNavigate={navigateMission}
        onDeliver={(mission) =>
          engine.current?.connection.deliverCargo(mission.id, mission.cargo!.id, mission.destination.id)
        }
        onScan={(mission) => engine.current?.connection.startScan(mission.id, mission.destination.id)}
        onIdentify={(mission) =>
          engine.current?.connection.identifyTarget(mission.id, mission.destination.id)
        }
        onAbandon={(missionId) => engine.current?.connection.abandonMission(missionId)}
      />
      <HangarPanel
        open={hangarOpen}
        state={state}
        error={view.error}
        onClose={() => setHangarOpen(false)}
        onSelectShip={(shipId) => engine.current?.connection.selectShip(shipId)}
        onFuel={(amountKg) => engine.current?.connection.buyFuel(amountKg)}
        onRepair={() => engine.current?.connection.repairShip()}
        onAmmunition={(amountKg) => engine.current?.connection.buyAmmunition(amountKg)}
        onUpgrade={(upgradeId) => engine.current?.connection.installUpgrade(upgradeId)}
      />
      <section className="scene-caption">
        <span className="eyebrow">
          {scene === 'orbit_night'
            ? 'DÜNYA GÖLGESİ'
            : scene === 'cargo_mission'
              ? 'DENETİM HALKASI'
              : 'ALÇAK DÜNYA YÖRÜNGESİ'}
        </span>
        <h2>
          {scene === 'orbit_night'
            ? 'Gece vardiyası'
            : scene === 'cargo_mission'
              ? 'Denetim halkası varışı'
              : 'Sessizliğin üzerinde'}
        </h2>
        <p>
          {scene === 'orbit_night'
            ? 'Güneş hattının ötesinde. Seyir ışıkları etkin.'
            : scene === 'cargo_mission'
              ? '450 kilometrede. Görev kontrolü teslimat için bağlantıda.'
              : '400 kilometre yukarıda. Her hareketin bir karşılığı var.'}
        </p>
      </section>
      <div className="center-reticle" aria-hidden="true">
        <span />
        <i />
        <span />
      </div>
      <aside className="right-telemetry">
        <div className="vertical-label">YÖRÜNGE TELEMETRİSİ</div>
        <div className="telemetry-reading">
          <small>RADYAL HIZ</small>
          <strong>
            {radial.toFixed(1)}
            <em>m/s</em>
          </strong>
          <div className="scale-lines" />
        </div>
        <div className="telemetry-reading maneuver-reading">
          <small>MANEVRA DURUMU</small>
          <strong>{maneuverStatus.replaceAll('_', ' ')}</strong>
        </div>
        <div className="telemetry-reading">
          <small>GEÇEN SÜRE</small>
          <strong className="clock" data-testid="clock">
            {clock}
          </strong>
        </div>
        <button className="camera-button" onClick={resetCamera}>
          ⌖ Kamerayı toparla <kbd>C</kbd>
        </button>
        <button className="debug-toggle" onClick={() => setDebug((v) => !v)} aria-expanded={debug}>
          Telemetri ayrıntıları <kbd>F3</kbd>
        </button>
      </aside>
      {debug && <DebugHud metrics={view.metrics} state={state} server={view.server} />}
      <footer className="flight-strip">
        <div className="strip-status">
          <i className={active ? 'live' : ''} />
          <span>
            {active ? 'KUMANDA ETKİN' : 'GÖZLEM MODU'}
            <small>{active ? 'Tıklayarak uçuşa odaklan' : 'Kumandayı devralarak başla'}</small>
          </span>
        </div>
        <div className="strip-stat">
          <small>ANA İTKİ</small>
          <strong>
            {Math.round(Math.max(0, -(state?.controls.translation[2] ?? 0)) * 100)}
            <em> %</em>
          </strong>
          <div className="thrust-track">
            <span style={{ width: `${Math.max(0, -(state?.controls.translation[2] ?? 0)) * 100}%` }} />
          </div>
        </div>
        <div className="strip-stat">
          <small>YAKIT</small>
          <strong>
            {propellant.toFixed(0)}
            <em> kg · {propellantPercent.toFixed(0)}%</em>
          </strong>
        </div>
        <div className="strip-stat">
          <small>KULLANILABİLİR Δv</small>
          <strong>
            {shipDeltaV.toFixed(0)}
            <em> m/s</em>
          </strong>
        </div>
        <div className="strip-stat selected-plan-stat">
          <small>SEÇİLİ PLAN / REZERV</small>
          <strong>
            {selectedCandidate ? selectedCandidate.estimatedPropellantKg.toFixed(0) : '—'}
            <em>
              {selectedCandidate ? ` kg / ${selectedCandidate.expectedReserveDeltaVMps.toFixed(0)} m/s` : ''}
            </em>
          </strong>
        </div>
        <div className="controls-inline">
          <span>
            <kbd>W</kbd>
            <kbd>S</kbd> İtki
          </span>
          <span>
            <kbd>↑</kbd>
            <kbd>←</kbd>
            <kbd>↓</kbd>
            <kbd>→</kbd> Yön
          </span>
          <span>Fareyle bakış</span>
        </div>
        <div className="render-badge">
          {view.metrics?.backend ?? 'BAŞLATILIYOR'}
          <small>OTORİTER SUNUCU</small>
        </div>
      </footer>
      {!ready && (
        <div className="loading-toast" role="status">
          {view.error ? `Başlatılamadı: ${view.error}` : 'Yörünge bağlantısı kuruluyor…'}
        </div>
      )}
      {ready && view.status !== 'Bağlı' && (
        <div className="error-toast" role="alert">
          {view.status === 'Kumanda başka sekmede'
            ? 'Kumanda başka sekmede. Bu sekmede uçmak için Kumandayı devral düğmesine bas.'
            : `${view.status}. Yerel sunucuyu kontrol edip sayfayı yenile.`}
        </div>
      )}
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="modal"
            role="dialog"
            aria-label="Uçuş kontrolleri"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal-close" onClick={() => setHelp(false)} aria-label="Kapat">
              ×
            </button>
            <div className="eyebrow">
              {activeDefinition?.name.toUpperCase() ?? 'ARAÇ'} / KISA UÇUŞ KILAVUZU
            </div>
            <h2>Hareketi hisset.</h2>
            <p>
              Önce kumandayı devral, ardından uzay görünümüne tıkla. İtki kesilince gemi hareketini korur.
            </p>
            <dl className="help-keys">
              <dt>W / S</dt>
              <dd>İleri / geri itki</dd>
              <dt>A / D</dt>
              <dd>Sola / sağa yanal itki</dd>
              <dt>R / F</dt>
              <dd>Yukarı / aşağı itki</dd>
              <dt>Ok tuşları</dt>
              <dd>Burun ve yön kontrolü</dd>
              <dt>Q / E</dt>
              <dd>Yatış kontrolü</dd>
              <dt>Space</dt>
              <dd>Kontrol girdilerini bırak; hızı sıfırlamaz</dd>
              <dt>Fare sürükle / tekerlek</dt>
              <dd>Kamerayı döndür / uzaklaş</dd>
              <dt>C / F3</dt>
              <dd>Kamerayı toparla / debug telemetri</dd>
            </dl>
            <p className="fine">
              Oturum 3: yakıt, manevra bilgisayarı ve yerel NPC görevleri etkindir. Silah sistemi henüz
              yoktur.
            </p>
          </section>
        </div>
      )}
      {credits && (
        <div className="modal-backdrop" onClick={() => setCredits(false)}>
          <section
            className="modal"
            role="dialog"
            aria-label="Kaynaklar"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal-close" onClick={() => setCredits(false)} aria-label="Kapat">
              ×
            </button>
            <div className="eyebrow">VARLIK KAYNAKLARI</div>
            <h2>Dünya, gerçek veriden.</h2>
            <p>
              Dünya yüzeyi: NASA Goddard / Reto Stöckli, Robert Simmon ve MODIS ekipleri. Blue Marble G57730;
              NASA 8K kaynak dosyası.
            </p>
            <p>
              <a
                href="https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57730/land_ocean_ice_8192.png"
                target="_blank"
                rel="noreferrer"
              >
                Kaynak ve üretici bilgileri ↗
              </a>
            </p>
            <p>
              <a
                href="https://www.nasa.gov/nasa-brand-center/images-and-media/"
                target="_blank"
                rel="noreferrer"
              >
                NASA kullanım koşulları ↗
              </a>{' '}
              · Doku dosyası değiştirilmeden kullanılır.
            </p>
            <p>
              Bulut ve gece haritaları:{' '}
              <a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noreferrer">
                Solar System Scope / INOVE ↗
              </a>
              , NASA verilerinden.{' '}
              <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
                CC BY 4.0 ↗
              </a>
              . Dosyalar değiştirilmeden kullanılır.
            </p>
            <p>
              Gemi geometrisi, yıldız alanı, arayüz ve atmosfer bu proje için üretildi. Atmosfer ve gece dolgu
              ışığı sinematik yaklaşımlardır.
            </p>
            <p className="fine">Hiçbir kurumun proje desteği veya onayı ima edilmez.</p>
          </section>
        </div>
      )}
    </main>
  );
}
