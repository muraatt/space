import {
  AmbientLight,
  Color,
  DirectionalLight,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
  WebGPURenderer,
  ACESFilmicToneMapping,
} from 'three/webgpu';
import { CONFIG, type ManeuverCandidate, type WorldState } from '@orbital/shared';
import { length, dot } from '@orbital/simulation';
import { makeEarth } from './earth';
import { makeStars } from './stars';
import { makeShip } from './ship';
import { FlightCamera } from './camera';
import { renderFrame } from './render-frame';
import { ManeuverOverlay } from './maneuver-overlay';
import { CombatOverlay } from './combat-overlay';
import { StationVisual } from './station';
import { RemotePlayersVisual } from './remote-players';
export class GameRenderer {
  renderer: WebGPURenderer;
  camera: FlightCamera;
  // This pass contains kilometre-scale objects only. A metre-scale near plane wastes depth precision.
  farCamera = new PerspectiveCamera(45, 1, 1, 50000);
  far = new Scene();
  near = new Scene();
  ship = makeShip();
  maneuver = new ManeuverOverlay();
  combat = new CombatOverlay();
  station = new StationVisual();
  remotePlayers = new RemotePlayersVisual();
  earth?: Awaited<ReturnType<typeof makeEarth>>;
  sunNear = new DirectionalLight('#fff3de', 3.8);
  sunFar = new DirectionalLight('#fff5e7', 3.0);
  backend = 'initializing';
  adapter: Record<string, unknown> = {};
  ready = false;
  drawCalls = 0;
  triangles = 0;
  frameTimes: number[] = [];
  private previousFrame = 0;
  private resizeObserver: ResizeObserver;
  private sunEci = new Vector3();
  private localSun = new Vector3();
  constructor(
    public canvas: HTMLCanvasElement,
    forceWebGL: boolean,
  ) {
    this.renderer = new WebGPURenderer({
      canvas,
      antialias: !forceWebGL,
      alpha: false,
      forceWebGL,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(1);
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.autoClear = false;
    this.camera = new FlightCamera(canvas);
    this.far.background = new Color('#03070c');
    this.far.add(makeStars(), this.maneuver.group);
    this.near.add(this.ship.group, this.station.group, this.combat.group, this.remotePlayers.group, this.sunNear, new AmbientLight('#9faebc', 0.85));
    const fill = new DirectionalLight('#b6c9dc', 1.25);
    fill.position.set(-12, 8, 12);
    this.near.add(fill);
    this.far.add(this.sunFar, new AmbientLight('#789ec3', 0.14));
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }
  async init() {
    await this.renderer.init();
    this.backend = (this.renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend
      ? 'WebGPU'
      : 'WebGL2';
    this.earth = await makeEarth();
    this.far.add(this.earth.group);
    const backend = this.renderer.backend as unknown as {
      device?: {
        adapterInfo?: { vendor?: string; architecture?: string; device?: string; description?: string };
      };
      gl?: WebGL2RenderingContext;
    };
    if (backend.device?.adapterInfo) {
      const i = backend.device.adapterInfo;
      this.adapter = {
        vendor: i.vendor,
        architecture: i.architecture,
        device: i.device,
        description: i.description,
      };
    }
    if (backend.gl) {
      const gl = backend.gl,
        ext = gl.getExtension('WEBGL_debug_renderer_info');
      this.adapter = {
        renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      };
    }
    this.ready = true;
  }
  private resize() {
    const rect = this.canvas.getBoundingClientRect(),
      w = Math.max(1, rect.width),
      h = Math.max(1, rect.height);
    this.renderer.setSize(w, h, false);
    this.camera.resize(w, h);
    this.farCamera.aspect = w / h;
    this.farCamera.updateProjectionMatrix();
  }
  render(world: WorldState, now: number) {
    if (!this.ready || !this.earth) return;
    const frame = renderFrame(world.ship),
      q = new Quaternion(...world.ship.orientation);
    this.ship.setVariant(world.ship.definitionId);
    this.ship.group.quaternion.copy(frame.eciToLocal).multiply(q);
    this.ship.setThrust(Math.max(0, -world.controls.translation[2]));
    this.earth.group.position.copy(frame.local([0, 0, 0])).multiplyScalar(0.001);
    this.earth.group.quaternion.copy(frame.eciToLocal);
    this.maneuver.update(world, frame);
    this.combat.update(world, frame);
    this.station.update(world, frame);
    this.remotePlayers.update(world.remotePlayers, frame);
    // Shared authority lighting is ECI-fixed and identical for every connected pilot.
    const sunDirection = world.lightingMode === 'NIGHT' ? [-0.8, 0.15, -0.6] : [0.55, 0.5, -1];
    this.sunEci.set(sunDirection[0], sunDirection[1], sunDirection[2]).normalize();
    this.localSun.copy(this.sunEci).applyQuaternion(frame.eciToLocal);
    this.sunFar.position.copy(this.localSun).multiplyScalar(10000);
    this.sunFar.target.position.set(0, 0, 0);
    this.earth.atmosphere.sun.value.copy(this.localSun);
    this.earth.atmosphere.center.value.copy(this.earth.group.position);
    const projection = dot(world.ship.position, [this.sunEci.x, this.sunEci.y, this.sunEci.z]);
    const radius = length(world.ship.position),
      eclipsed = projection < 0 && radius * radius - projection * projection < CONFIG.earthRadius ** 2;
    this.sunNear.intensity = eclipsed ? 0 : 3.8;
    this.sunNear.position.copy(this.localSun).multiplyScalar(100);
    this.farCamera.position.copy(this.camera.camera.position).multiplyScalar(0.001);
    this.farCamera.quaternion.copy(this.camera.camera.quaternion);
    this.renderer.info.reset();
    this.renderer.info.autoReset = false;
    this.renderer.clear();
    this.renderer.render(this.far, this.farCamera);
    this.renderer.clearDepth();
    this.renderer.render(this.near, this.camera.camera);
    this.drawCalls = this.renderer.info.render.drawCalls;
    this.triangles = this.renderer.info.render.triangles;
    if (this.previousFrame && now > this.previousFrame) {
      this.frameTimes.push(now - this.previousFrame);
      if (this.frameTimes.length > 30000) this.frameTimes.shift();
    }
    this.previousFrame = now;
  }
  setManeuverVisual(targetRadiusM?: number, candidate?: ManeuverCandidate) {
    this.maneuver.setPlan(targetRadiusM, candidate);
  }
  clear() {
    if (!this.ready) return;
    this.renderer.clear(true, true, true);
  }
  metrics() {
    const values = this.frameTimes.slice(-240).sort((a, b) => a - b),
      avg = values.reduce((a, b) => a + b, 0) / (values.length || 1);
    return {
      backend: this.backend,
      antialiasSamples: this.renderer.samples,
      adapter: this.adapter,
      drawCalls: this.drawCalls,
      triangles: this.triangles,
      frameMs: avg,
      fps: avg ? 1000 / avg : 0,
      p95Ms: values[Math.floor(values.length * 0.95)] ?? 0,
      frames: this.frameTimes.length,
      viewport: [this.canvas.width, this.canvas.height],
      pixelRatio: 1,
    };
  }
  dispose() {
    this.resizeObserver.disconnect();
    this.camera.dispose();
    for (const scene of [this.far, this.near])
      scene.traverse((object) => {
        const mesh = object as unknown as {
          geometry?: { dispose: () => void };
          material?: { dispose: () => void } | { dispose: () => void }[];
        };
        mesh.geometry?.dispose();
        if (mesh.material) {
          for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.dispose();
        }
      });
    this.renderer.dispose();
  }
}
