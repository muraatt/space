import { CONFIG, neutralControls, type SceneId, type ServerMetrics } from '@orbital/shared';
import { initialWorld, step } from '@orbital/simulation';
import { MemoryRepository } from './persistence/memory-repository';
export class World {
  state = initialWorld();
  paused = false;
  lastInputAt = 0;
  rejectedCommands = 0;
  private times: number[] = [];
  private repository = new MemoryRepository();
  reset(scene: SceneId, paused = false, seed = 4401) {
    this.state = initialWorld(scene, seed);
    this.paused = paused;
    this.lastInputAt = 0;
    this.repository.write(this.state);
  }
  tick(now: number) {
    if (this.paused) return;
    const start = performance.now();
    if (now - this.lastInputAt > CONFIG.inputTimeoutMs) this.state.controls = neutralControls();
    this.state = step(this.state);
    this.times.push(performance.now() - start);
    if (this.times.length > 3600) this.times.shift();
    if (this.state.tick % 60 === 0) this.repository.write(this.state);
  }
  metrics(backlogMs = 0): ServerMetrics {
    const a = [...this.times].sort((x, y) => x - y),
      p = (n: number) => a[Math.min(a.length - 1, Math.floor(a.length * n))] ?? 0;
    return {
      tickMs: this.times.at(-1) ?? 0,
      tickP95Ms: p(0.95),
      tickP99Ms: p(0.99),
      backlogMs,
      rejectedCommands: this.rejectedCommands,
    };
  }
}
