import { Worker } from 'node:worker_threads';
import type { ManeuverPlanResult, ManeuverTarget, ShipState } from '@orbital/shared';

export class PlannerService {
  private readonly worker = new Worker(new URL('./worker.ts', import.meta.url), {
    execArgv: ['--import', 'tsx'],
  });
  private nextId = 1;
  private failed?: Error;
  private readonly pending = new Map<
    number,
    { resolve: (result: ManeuverPlanResult) => void; reject: (error: Error) => void }
  >();

  constructor() {
    this.worker.on('message', (message: { id: number; result?: ManeuverPlanResult; error?: string }) => {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.result) pending.resolve(message.result);
      else pending.reject(new Error(message.error ?? 'PLANNER_FAILED'));
    });
    this.worker.on('error', (error) => {
      this.failed = error;
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    });
    this.worker.on('exit', (code) => {
      if (code === 0 || this.failed) return;
      this.failed = new Error(`Planner worker exited with code ${code}`);
      for (const pending of this.pending.values()) pending.reject(this.failed);
      this.pending.clear();
    });
  }

  plan(ship: ShipState, target: ManeuverTarget): Promise<ManeuverPlanResult> {
    if (this.failed) return Promise.reject(this.failed);
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, ship, target });
    });
  }

  async close() {
    for (const pending of this.pending.values()) pending.reject(new Error('PLANNER_CLOSED'));
    this.pending.clear();
    await this.worker.terminate();
  }
}
