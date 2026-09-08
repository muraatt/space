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
import { length } from '@orbital/simulation';
import { Connection } from './net/connection';
import { FlightControls } from './input/flight-controls';
import { GameRenderer } from './render/renderer';
import { installTestBridge } from './debug/test-bridge';
import { DebugHud } from './ui/debug-hud';
import { ManeuverPanel, ORBIT_TARGETS } from './ui/maneuver-panel';
import { MissionPanel } from './ui/mission-panel';
import { HangarPanel } from './ui/hangar-panel';
import { CombatPanel } from './ui/combat-panel';
import { OrbitalMap } from './ui/orbital-map';
import { TelemetryStrip } from './ui/telemetry-strip';
import { OpsPanel } from './ui/ops-panel';
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
  flightAllowed: boolean;
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
    flightAllowed: false,
  });
  const [ready, setReady] = useState(false),
    [active, setActive] = useState(false),
    [help, setHelp] = useState(false),
    [credits, setCredits] = useState(false),
    [debug, setDebug] = useState(false),
    [plannerOpen, setPlannerOpen] = useState(false),
    [missionOpen, setMissionOpen] = useState(false),
    [hangarOpen, setHangarOpen] = useState(false),
    [combatOpen, setCombatOpen] = useState(false),
    [opsOpen, setOpsOpen] = useState(false),
    [targetId, setTargetId] = useState('service-800'),
    [selectedType, setSelectedType] = useState<ManeuverCandidateType>();
  const modalOpen = useRef(false), focusAfterConnect = useRef(false);
  modalOpen.current = help || credits;
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
        if (scene === 'intercept' || scene === 'missile_hit') renderer.camera.combatView();
        if (!alive) {
          renderer.dispose();
          return;
        }
        controls = new FlightControls(
          canvas, renderer.camera.reset,
          () => connection.flightInputAllowed() && !modalOpen.current,
          (focused) => { if (alive) setActive(focused); },
        );
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
              flightAllowed: connection.flightInputAllowed(),
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
    if (scene === 'cargo_mission' || scene === 'intercept') setMissionOpen(true);
    if (scene === 'missile_hit') setCombatOpen(true);
  }, [scene]);
  useEffect(() => {
    if (!selectedType && view.plan?.candidates[0]) setSelectedType(view.plan.candidates[0].type);
  }, [selectedType, view.plan]);
  useEffect(() => {
    if (view.state?.combat.playerDestroyed) {
      engine.current?.controls.clear();
      setPlannerOpen(false);
      setMissionOpen(false);
      setHangarOpen(false);
      setCombatOpen(true);
    }
  }, [view.state?.combat.playerDestroyed]);
  useEffect(() => {
    if (view.status === 'Bağlı' && view.state && focusAfterConnect.current) {
      focusAfterConnect.current = false;
      canvasRef.current?.focus();
      engine.current?.controls.activate();
    }
  }, [view.status, view.state]);
  useEffect(() => {
    if (help || credits) {
      engine.current?.controls.clear();
      document.querySelector<HTMLButtonElement>('.modal-close')?.focus();
    } else if (document.activeElement === canvasRef.current) {
      engine.current?.controls.activate();
    }
  }, [help, credits]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (modalOpen.current && e.code === 'Tab') {
        const focusable = Array.from(document.querySelectorAll<HTMLElement>('.modal button, .modal a[href]'));
        const index = focusable.indexOf(document.activeElement as HTMLElement);
        if (focusable.length) {
          e.preventDefault();
          focusable[(index + (e.shiftKey ? -1 : 1) + focusable.length) % focusable.length].focus();
        }
      }
      if (e.code === 'F3' && !e.repeat) {
        e.preventDefault();
        setDebug((v) => !v);
      }
      if (e.code === 'Escape') {
        setHelp(false);
        setCredits(false);
        setPlannerOpen(false);
        setMissionOpen(false);
        setHangarOpen(false);
        setCombatOpen(false);
        canvasRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  const takeControl = () => {
    if (engine.current) {
      if (engine.current.connection.status !== 'Bağlı') {
        focusAfterConnect.current = true;
        engine.current.connection.connect(scene, true);
        return;
      }
      if (view.state?.combat.playerDestroyed) { openCombat(); return; }
      if (!engine.current.connection.flightInputAllowed()) { openPlanner(); return; }
      setPlannerOpen(false);
      setMissionOpen(false);
      setHangarOpen(false);
      setCombatOpen(false);
      engine.current.controls.activate();
      canvasRef.current?.focus();
    }
  };
  const resetCamera = () => {
    engine.current?.renderer.camera.reset();
    canvasRef.current?.focus();
  };
  const state = view.state,
    activeDefinition = state ? shipDefinition(state.ship.definitionId) : undefined,
    target = ORBIT_TARGETS.find((option) => option.id === targetId) ?? ORBIT_TARGETS[0],
    selectedCandidate =
      state?.maneuver?.candidate ??
      view.plan?.candidates.find((candidate) => candidate.type === selectedType);
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
    engine.current?.controls.clear();
    setMissionOpen(false);
    setHangarOpen(false);
    setCombatOpen(false);
    setPlannerOpen(true);
  };
  const openMissions = () => {
    engine.current?.controls.clear();
    setPlannerOpen(false);
    setHangarOpen(false);
    setCombatOpen(false);
    setMissionOpen(true);
  };
  const openHangar = () => {
    engine.current?.controls.clear();
    setPlannerOpen(false);
    setMissionOpen(false);
    setCombatOpen(false);
    setHangarOpen(true);
  };
  const openCombat = () => {
    engine.current?.controls.clear();
    setPlannerOpen(false);
    setMissionOpen(false);
    setHangarOpen(false);
    setCombatOpen(true);
  };
  const closeSystems = () => {
    setPlannerOpen(false);
    setMissionOpen(false);
    setHangarOpen(false);
    setCombatOpen(false);
    requestAnimationFrame(() => {
      canvasRef.current?.focus();
      engine.current?.controls.activate();
    });
  };
  const connected = view.status === 'Bağlı',
    destroyed = !!state?.combat.playerDestroyed,
    flying = active && connected && view.flightAllowed && !help && !credits,
    controlLabel = !connected ? 'BAĞLANTI YOK' : destroyed ? 'GEMİ İMHA EDİLDİ'
      : !view.flightAllowed ? 'MANEVRA KUMANDASI' : flying ? 'KUMANDA ETKİN' : 'UÇUŞA ODAKLAN',
    controlHint = !connected ? 'Kumandayı devral ile yeniden bağlan'
      : destroyed ? 'Kurtarmayı aç ve yedek araç talep et'
      : !view.flightAllowed ? 'Doğrudan uçuş için manevrayı iptal et'
      : flying ? 'WASD · R/F · Oklar · Q/E' : 'Uzay görünümüne tıkla veya kumandayı devral',
    activeMission = state?.missions.find((mission) => mission.id === state.profile.activeMissionId),
    selectedContact = state?.combat.contacts.find((contact) => contact.id === state.combat.selectedTargetId),
    mapTargetRadius = selectedContact ? length(selectedContact.position)
      : activeMission ? CONFIG.earthRadius + activeMission.destination.altitudeKm * 1000
      : view.plan ? CONFIG.earthRadius + target.altitudeKm * 1000 : undefined,
    anySystemOpen = plannerOpen || missionOpen || hangarOpen || combatOpen;
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
      {!anySystemOpen && <div className="hud-left">
        <OrbitalMap state={state} targetRadiusM={mapTargetRadius} targetPosition={selectedContact?.position} candidate={selectedCandidate} />
        <section className="vehicle-card">
          <div><small>ACTIVE VEHICLE / {activeDefinition?.callsign ?? '—'}</small><h2>{activeDefinition?.name ?? 'Bağlanıyor'}</h2></div>
          <span>{state ? `${state.ship.massKg.toFixed(0)} kg` : '—'} · {state?.combat.region ?? '—'}</span>
        </section>
      </div>}
      {!anySystemOpen && <nav className="system-dock" aria-label="Sistem erişimi">
        <button className="primary-action" disabled={!ready || view.status === 'Bağlanıyor'} onClick={takeControl}>
          {!connected ? 'KUMANDAYI DEVRAL' : destroyed ? 'KURTARMAYI AÇ' : !view.flightAllowed ? 'MANEVRAYI YÖNET' : flying ? 'UÇUŞA ODAKLAN' : 'KUMANDAYI DEVRAL'}
        </button>
        <button className="planner-toggle" disabled={!ready} onClick={openPlanner}>MANEVRA BİLGİSAYARI</button>
        <button className="mission-toggle" disabled={!ready} onClick={openMissions}>GÖREV KONTROLÜ</button>
        <button className="mission-toggle" disabled={!ready} onClick={openHangar}>HANGAR VE SERVİS</button>
        <button className="combat-toggle" disabled={!ready} onClick={openCombat}>ATEŞ KONTROLÜ</button>
        <span className="scene-control"><button aria-pressed={scene === 'orbit_day'} onClick={() => goScene(false)}>☀ Gündüz</button><button aria-pressed={scene === 'orbit_night'} onClick={() => goScene(true)}>◐ Gece</button></span>
      </nav>}
      <ManeuverPanel
        open={plannerOpen}
        target={target}
        plan={view.plan}
        pending={view.planPending}
        selectedType={selectedType}
        execution={state?.maneuver}
        error={view.error}
        onClose={closeSystems}
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
        onClose={closeSystems}
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
        onClose={closeSystems}
        onSelectShip={(shipId) => engine.current?.connection.selectShip(shipId)}
        onFuel={(amountKg) => engine.current?.connection.buyFuel(amountKg)}
        onRepair={() => engine.current?.connection.repairShip()}
        onAmmunition={(amountKg) => engine.current?.connection.buyAmmunition(amountKg)}
        onUpgrade={(upgradeId) => engine.current?.connection.installUpgrade(upgradeId)}
      />
      <CombatPanel
        open={combatOpen}
        state={state}
        error={view.error}
        onClose={closeSystems}
        onSelect={(id) => engine.current?.connection.selectCombatTarget(id)}
        onClear={() => engine.current?.connection.clearCombatTarget()}
        onLaser={() => engine.current?.connection.fireLaser()}
        onMissile={() => engine.current?.connection.fireMissile()}
        onCountermeasure={() => engine.current?.connection.activateCountermeasure()}
        onRecover={() => engine.current?.connection.claimReplacement()}
        onReturnHangar={() => {
          setCombatOpen(false);
          setHangarOpen(true);
        }}
      />
      {!anySystemOpen && <section className="scene-caption">
        <span className="eyebrow">
          {scene === 'orbit_night'
            ? 'DÜNYA GÖLGESİ'
            : scene === 'cargo_mission'
              ? 'DENETİM HALKASI'
              : scene === 'intercept' || scene === 'missile_hit'
                ? scene === 'missile_hit'
                  ? 'ÇEKİŞMELİ BÖLGE · DARBE TESTİ'
                  : 'NORMAL BÖLGE · GÖREV TEMASI'
                : 'ALÇAK DÜNYA YÖRÜNGESİ'}
        </span>
        <h2>
          {scene === 'orbit_night'
            ? 'Gece vardiyası'
            : scene === 'cargo_mission'
              ? 'Denetim halkası varışı'
              : scene === 'intercept' || scene === 'missile_hit'
                ? scene === 'missile_hit' ? 'Füze darbe testi' : 'R-17 önleme hattı'
                : 'Sessizliğin üzerinde'}
        </h2>
        <p>
          {scene === 'orbit_night'
            ? 'Güneş hattının ötesinde. Seyir ışıkları etkin.'
            : scene === 'cargo_mission'
              ? '450 kilometrede. Görev kontrolü teslimat için bağlantıda.'
              : scene === 'intercept' || scene === 'missile_hit'
                ? scene === 'missile_hit' ? 'Gelen darbeyi ve alt sistem kaybını gözle.' : 'Hedefi tanımla; ateş yetkisi sunucudan gelir.'
                : '400 kilometre yukarıda. Her hareketin bir karşılığı var.'}
        </p>
      </section>}
      <div className="center-reticle" aria-hidden="true">
        <span />
        <i />
        <span />
      </div>
      {!anySystemOpen && <TelemetryStrip state={state} clock={clock} onCamera={resetCamera} onDebug={() => setDebug(v => !v)} />}
      {!anySystemOpen && <OpsPanel state={state} expanded={opsOpen} onToggle={() => setOpsOpen(v => !v)} onMissions={openMissions} onPlanner={openPlanner} onCombat={openCombat} />}
      {debug && <DebugHud metrics={view.metrics} state={state} server={view.server} />}
      {!anySystemOpen && <footer className="flight-strip">
        <div className="strip-status">
          <i className={flying ? 'live' : ''} />
          <span>
            {controlLabel}
            <small>{controlHint}</small>
          </span>
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
      </footer>}
      {!ready && (
        <div className="loading-toast" role="status">
          {view.error ? `Başlatılamadı: ${view.error}` : 'Yörünge bağlantısı kuruluyor…'}
        </div>
      )}
      {destroyed && connected && (
        <div className="error-toast" role="alert">
          Gemi imha edildi. Uçuş ve silah kontrolleri kapalı.
          <button onClick={openCombat}>KURTARMAYI AÇ</button>
        </div>
      )}
      {ready && view.status !== 'Bağlı' && (
        <div className="error-toast" role="alert">
          {view.status === 'Kumanda başka sekmede'
            ? 'Kumanda başka sekmede. Bu sekmede uçmak için Kumandayı devral düğmesine bas.'
            : `${view.status}. Kumandayı devral düğmesiyle yeniden bağlan.`}
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
              Uzay görünümüne tıkla veya kumandayı devral. İtki kesilince gemi hareketini korur.
              Panelde işlem yaptıktan sonra uçuşa dönmek için tekrar uzaya tıkla. Escape panelleri kapatır.
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
              Lazer, füze ve karşı tedbir Ateş kontrolü panelindedir. Etkin manevrada doğrudan itki
              kilitlidir; önce manevrayı iptal et. İmha sonrası Kurtarmayı aç üzerinden yedek araç talep et.
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
