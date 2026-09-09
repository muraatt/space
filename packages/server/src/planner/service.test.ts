import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { CONFIG } from '@orbital/shared';
import { initialWorld } from '@orbital/simulation';
import { PlannerService, type PlannerWorker } from './service';

const emptyPlan = { version: 1 as const, candidates: [], rejected: [] };

class FakeWorker extends EventEmitter implements PlannerWorker {
  posted: Array<{ id: number }> = [];
  terminated = false;
  postMessage(message: unknown) { this.posted.push(message as { id: number }); }
  async terminate() { this.terminated = true; return 1; }
}

describe('planner worker service', () => {
  const services: PlannerService[] = [];
  afterEach(async () => Promise.all(services.splice(0).map((service) => service.close())));

  it('returns authoritative candidates off the server tick thread', async () => {
    const service = new PlannerService();
    services.push(service);
    const result = await service.plan(initialWorld().ship, {
      kind: 'CIRCULAR_ORBIT',
      radiusM: CONFIG.earthRadius + 800_000,
      phaseAheadRad: 0.5,
    });
    expect(result.candidates.map((candidate) => candidate.type)).toEqual(['ECONOMIC', 'BALANCED', 'FAST']);
    let mainLoopAdvanced = false;
    const pending = service.plan(initialWorld().ship, {
      kind: 'CIRCULAR_ORBIT',
      radiusM: CONFIG.earthRadius + 800_000,
      phaseAheadRad: 0.5,
    });
    await new Promise<void>((resolve) =>
      setImmediate(() => {
        mainLoopAdvanced = true;
        resolve();
      }),
    );
    expect(mainLoopAdvanced).toBe(true);
    await pending;
  });

  it('bounds one owner and schedules another owner before the flood backlog', async () => {
    const workers: FakeWorker[] = [], service = new PlannerService({
      workerFactory: () => { const worker = new FakeWorker(); workers.push(worker); return worker; },
      maxRequestsPerOwner: 2,
      requestTimeoutMs: 1_000,
    }), ship = initialWorld().ship,
      target = { kind: 'CIRCULAR_ORBIT' as const, radiusM: CONFIG.earthRadius + 500_000, phaseAheadRad: 0.1 },
      a1 = service.plan(ship, target, 'A'),
      a2 = service.plan(ship, target, 'A'),
      rejected = service.plan(ship, target, 'A'),
      b1 = service.plan(ship, target, 'B');
    services.push(service);
    await expect(rejected).rejects.toMatchObject({ code: 'PLANNER_BUSY' });
    expect(workers[0].posted.map((item) => item.id)).toEqual([1]);
    workers[0].emit('message', { id: 1, result: emptyPlan });
    await expect(a1).resolves.toEqual(emptyPlan);
    expect(workers[0].posted.map((item) => item.id)).toEqual([1, 3]);
    workers[0].emit('message', { id: 3, result: emptyPlan });
    await expect(b1).resolves.toEqual(emptyPlan);
    expect(workers[0].posted.map((item) => item.id)).toEqual([1, 3, 2]);
    workers[0].emit('message', { id: 2, result: emptyPlan });
    await expect(a2).resolves.toEqual(emptyPlan);
    expect(service.stats()).toEqual({ active: 0, queued: 0, owners: 0 });
  });

  it('rejects the crashed request, restarts the worker and serves queued work', async () => {
    const workers: FakeWorker[] = [], service = new PlannerService({
      workerFactory: () => { const worker = new FakeWorker(); workers.push(worker); return worker; },
      requestTimeoutMs: 1_000,
    }), ship = initialWorld().ship,
      target = { kind: 'CIRCULAR_ORBIT' as const, radiusM: CONFIG.earthRadius + 500_000, phaseAheadRad: 0.1 },
      crashed = service.plan(ship, target, 'A'),
      survivor = service.plan(ship, target, 'B');
    services.push(service);
    workers[0].emit('error', new Error('synthetic crash'));
    await expect(crashed).rejects.toMatchObject({ code: 'PLANNER_WORKER_FAILED' });
    expect(workers).toHaveLength(2);
    expect(workers[1].posted.map((item) => item.id)).toEqual([2]);
    workers[1].emit('message', { id: 2, result: emptyPlan });
    await expect(survivor).resolves.toEqual(emptyPlan);
    const recovered = service.plan(ship, target, 'B');
    workers[1].emit('message', { id: 3, result: emptyPlan });
    await expect(recovered).resolves.toEqual(emptyPlan);
  });

  it('times out stuck work with a specific error and restarts cleanly', async () => {
    const workers: FakeWorker[] = [], service = new PlannerService({
      workerFactory: () => { const worker = new FakeWorker(); workers.push(worker); return worker; },
      requestTimeoutMs: 20,
    }), ship = initialWorld().ship,
      target = { kind: 'CIRCULAR_ORBIT' as const, radiusM: CONFIG.earthRadius + 500_000, phaseAheadRad: 0.1 },
      stuck = service.plan(ship, target, 'A');
    services.push(service);
    await expect(stuck).rejects.toMatchObject({ code: 'PLANNER_TIMEOUT' });
    expect(workers).toHaveLength(2);
    expect(service.stats()).toEqual({ active: 0, queued: 0, owners: 0 });
  });
});
