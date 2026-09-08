import { neutralControls, type Controls } from '@orbital/shared';
const keys = new Set([
  'KeyW',
  'KeyS',
  'KeyA',
  'KeyD',
  'KeyR',
  'KeyF',
  'KeyQ',
  'KeyE',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
]);
export class FlightControls {
  private pressed = new Set<string>();
  enabled = false;
  constructor(
    private canvas: HTMLCanvasElement,
    private resetCamera: () => void,
    private canActivate: () => boolean = () => true,
    private onFocusChange: (active: boolean) => void = () => {},
  ) {
    window.addEventListener('keydown', this.down);
    window.addEventListener('keyup', this.up);
    window.addEventListener('blur', this.clear);
    document.addEventListener('visibilitychange', this.visibility);
    canvas.addEventListener('pointerdown', this.focus);
    canvas.addEventListener('focus', this.activate);
    canvas.addEventListener('blur', this.clear);
  }
  private focus = () => {
    this.activate();
    this.canvas.focus({ preventScroll: true });
  };
  activate = () => {
    this.enabled = this.canActivate();
    this.onFocusChange(this.enabled);
  };
  private down = (e: KeyboardEvent) => {
    if (!this.enabled || !this.canActivate() || document.activeElement !== this.canvas) return;
    if (e.code === 'KeyC') {
      e.preventDefault();
      this.resetCamera();
      return;
    }
    if (keys.has(e.code)) {
      e.preventDefault();
      if (e.code === 'Space') this.pressed.clear();
      else if (!e.repeat) this.pressed.add(e.code);
    }
  };
  private up = (e: KeyboardEvent) => {
    this.pressed.delete(e.code);
  };
  clear = () => {
    this.pressed.clear();
    this.onFocusChange(false);
  };
  private visibility = () => {
    if (document.hidden) this.clear();
  };
  read(): Controls {
    if (!this.enabled || !this.canActivate() || document.hidden || document.activeElement !== this.canvas) return neutralControls();
    const a = (positive: string, negative: string) =>
      Number(this.pressed.has(positive)) - Number(this.pressed.has(negative));
    return {
      translation: [a('KeyD', 'KeyA'), a('KeyR', 'KeyF'), a('KeyS', 'KeyW')],
      rotation: [a('ArrowUp', 'ArrowDown'), a('ArrowLeft', 'ArrowRight'), a('KeyQ', 'KeyE')],
    };
  }
  dispose() {
    window.removeEventListener('keydown', this.down);
    window.removeEventListener('keyup', this.up);
    window.removeEventListener('blur', this.clear);
    document.removeEventListener('visibilitychange', this.visibility);
    this.canvas.removeEventListener('pointerdown', this.focus);
    this.canvas.removeEventListener('focus', this.activate);
    this.canvas.removeEventListener('blur', this.clear);
  }
}
