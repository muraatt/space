import { PerspectiveCamera, Vector3 } from 'three/webgpu';
export class FlightCamera {
  camera = new PerspectiveCamera(45, 1, 0.1, 1000);
  yaw = 0.64;
  pitch = 0.28;
  distance = 31;
  private dragging = false;
  private px = 0;
  private py = 0;
  constructor(private canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('pointercancel', this.up);
    canvas.addEventListener('wheel', this.wheel, { passive: false });
    this.update();
  }
  reset = () => {
    this.yaw = 0.64;
    this.pitch = 0.28;
    this.distance = 31;
    this.update();
  };
  private down = (e: PointerEvent) => {
    if (e.button !== 0) return;
    this.dragging = true;
    this.px = e.clientX;
    this.py = e.clientY;
    this.canvas.setPointerCapture(e.pointerId);
  };
  private move = (e: PointerEvent) => {
    if (!this.dragging) return;
    this.yaw -= (e.clientX - this.px) * 0.006;
    this.pitch = Math.max(-1.15, Math.min(1.15, this.pitch + (e.clientY - this.py) * 0.004));
    this.px = e.clientX;
    this.py = e.clientY;
    this.update();
  };
  private up = () => {
    this.dragging = false;
  };
  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    this.distance = Math.max(15, Math.min(85, this.distance * Math.exp(e.deltaY * 0.001)));
    this.update();
  };
  update() {
    const d = this.distance;
    this.camera.position.set(
      Math.sin(this.yaw) * Math.cos(this.pitch) * d,
      Math.sin(this.pitch) * d,
      Math.cos(this.yaw) * Math.cos(this.pitch) * d,
    );
    this.camera.lookAt(new Vector3(-3, 0, 0));
  }
  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  state() {
    return { yaw: this.yaw, pitch: this.pitch, distance: this.distance };
  }
  dispose() {
    this.canvas.removeEventListener('pointerdown', this.down);
    this.canvas.removeEventListener('pointermove', this.move);
    this.canvas.removeEventListener('pointerup', this.up);
    this.canvas.removeEventListener('pointercancel', this.up);
    this.canvas.removeEventListener('wheel', this.wheel);
  }
}
