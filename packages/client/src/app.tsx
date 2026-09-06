import { useEffect, useRef, useState } from 'react';
import { CONFIG, type WorldState, type ServerMetrics } from '@orbital/shared';
import { dot, length, normalize } from '@orbital/simulation';
import { Connection } from './net/connection';
import { FlightControls } from './input/flight-controls';
import { GameRenderer } from './render/renderer';
import { installTestBridge } from './debug/test-bridge';
import { DebugHud } from './ui/debug-hud';
import './styles.css';
type View = {
  state?: WorldState;
  metrics: ReturnType<GameRenderer['metrics']> | null;
  server?: ServerMetrics;
  status: string;
  rtt: number;
  error: string;
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
function OrbitDiagram() {
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
        400 km
      </text>
    </svg>
  );
}
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null),
    engine = useRef<{ renderer: GameRenderer; controls: FlightControls; connection: Connection } | null>(
      null,
    );
  const [view, setView] = useState<View>({ metrics: null, status: 'Bağlanıyor', rtt: 0, error: '' });
  const [ready, setReady] = useState(false),
    [active, setActive] = useState(false),
    [help, setHelp] = useState(false),
    [credits, setCredits] = useState(false),
    [debug, setDebug] = useState(false);
  const params = new URLSearchParams(location.search),
    scene = params.get('scene') === 'orbit_night' ? 'orbit_night' : 'orbit_day';
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
        inputTimer = setInterval(() => connection.input(controls!.read()), 1000 / CONFIG.inputHz);
        uiTimer = setInterval(() => {
          if (alive)
            setView({
              state: connection.snapshot?.state,
              metrics: renderer!.metrics(),
              server: connection.snapshot?.metrics,
              status: connection.status,
              rtt: connection.rttMs,
              error: connection.lastError,
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
    alt = state ? (length(state.ship.position) - CONFIG.earthRadius) / 1000 : 400,
    speed = state ? length(state.ship.velocity) / 1000 : 0,
    radial = state ? dot(state.ship.velocity, normalize(state.ship.position)) : 0;
  const elapsed = Math.floor((state?.tick ?? 0) * CONFIG.fixedDt),
    clock = `${String(Math.floor(elapsed / 3600)).padStart(2, '0')}:${String(Math.floor(elapsed / 60) % 60).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  const goScene = (night: boolean) => {
    const p = new URLSearchParams(location.search);
    p.set('scene', night ? 'orbit_night' : 'orbit_day');
    location.search = p.toString();
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
            AKTİF ARAÇ <span>ST—01</span>
          </div>
          <h2>Kestrel</h2>
          <p>Yörünge servis aracı</p>
          <div className="vehicle-meta">
            <span>12 m GÖVDE</span>
            <span>SABİT KÜTLE</span>
          </div>
          <OrbitDiagram />
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
        <p className="scope-note">
          OTURUM 1 · Uçuş ve görsel temel
          <br />
          İlerleme bu oturumda kalıcı değildir.
        </p>
      </aside>
      <section className="scene-caption">
        <span className="eyebrow">{scene === 'orbit_night' ? 'DÜNYA GÖLGESİ' : 'ALÇAK DÜNYA YÖRÜNGESİ'}</span>
        <h2>{scene === 'orbit_night' ? 'Gece vardiyası' : 'Sessizliğin üzerinde'}</h2>
        <p>
          {scene === 'orbit_night'
            ? 'Güneş hattının ötesinde. Seyir ışıkları etkin.'
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
          <small>AÇISAL HIZ</small>
          <strong>
            {(state ? (length(state.ship.angularVelocity) * 180) / Math.PI : 0).toFixed(1)}
            <em> °/s</em>
          </strong>
        </div>
        <div className="strip-stat">
          <small>FİZİK ADIMI</small>
          <strong>
            60<em> Hz</em>
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
            <div className="eyebrow">KESTREL / KISA UÇUŞ KILAVUZU</div>
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
              Oturum 1: kütle sabittir. Yakıt ve manevra bilgisayarı Oturum 2 kapsamındadır. Ücret, görev ve
              silah sistemi henüz yoktur.
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
