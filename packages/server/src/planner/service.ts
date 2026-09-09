import { Worker } from 'node:worker_threads';
import { CONFIG, type ManeuverPlanResult, type ManeuverTarget, type ShipState } from '@orbital/shared';

export interface PlannerWorker {
  on(event: 'message', listener: (message: { id: number; result?: ManeuverPlanResult; error?: string }) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'exit', listener: (code: number) => void): this;
  postMessage(message: unknown): void;
  terminate(): Promise<number>;
}
type WorkerFactory = () => PlannerWorker;

export type PlannerErrorCode =
  | 'PLANNER_BUSY'
  | 'PLANNER_QUEUE_FULL'
  | 'PLANNER_TIMEOUT'
  | 'PLANNER_WORKER_FAILED'
  | 'PLANNER_FAILED'
  | 'PLANNER_CLOSED';

export class PlannerServiceError extends Error {
  constructor(readonly code: PlannerErrorCode, message: string = code) { super(message); }
}

interface Request {
  id: number;
  ownerId: string;
  ship: ShipState;
  target: ManeuverTarget;
  resolve: (result: ManeuverPlanResult) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export interface PlannerServiceOptions {
  workerFactory?: WorkerFactory;
  maxRequestsPerOwner?: number;
  maxQueuedRequests?: number;
  requestTimeoutMs?: number;
}

export class PlannerService {
  private worker?: PlannerWorker;
  private readonly workerFactory: WorkerFactory;
  private readonly maxRequestsPerOwner: number;
  private readonly maxQueuedRequests: number;
  private readonly requestTimeoutMs: number;
  private nextId = 1;
  private active?: Request;
  private readonly queues = new Map<string, Request[]>();
  private readonly ownerPending = new Map<string, number>();
  private lastOwnerId?: string;
  private closed = false;

  constructor(options: PlannerServiceOptions = {}) {
    this.workerFactory = options.workerFactory ?? (() => new Worker(new URL('./worker.ts', import.meta.url), {
      execArgv: ['--import', 'tsx'],
    }) as unknown as PlannerWorker);
    this.maxRequestsPerOwner = options.maxRequestsPerOwner ?? CONFIG.plannerMaxRequestsPerOwner;
    this.maxQueuedRequests = options.maxQueuedRequests ?? CONFIG.plannerMaxQueuedRequests;
    this.requestTimeoutMs = options.requestTimeoutMs ?? CONFIG.plannerRequestTimeoutMs;
    this.spawnWorker();
  }

  private spawnWorker() {
    const worker = this.workerFactory();
    this.worker = worker;
    worker.on('message', (message: { id: number; result?: ManeuverPlanResult; error?: string }) => {
      if (worker !== this.worker || message.id !== this.active?.id) return;
      const request = this.active;
      this.active = undefined;
      this.finish(request);
      if (message.result) request.resolve(message.result);
      else request.reject(new PlannerServiceError('PLANNER_FAILED', message.error ?? 'PLANNER_FAILED'));
      this.dispatch();
    });
    worker.on('error', (error) => this.recoverWorker(worker, error));
    worker.on('exit', (code) => {
      if (worker === this.worker && !this.closed && code !== 0)
        this.recoverWorker(worker, new Error(`Planner worker exited with code ${code}`));
    });
  }

  private finish(request: Request) {
    clearTimeout(request.timeout);
    const remaining = (this.ownerPending.get(request.ownerId) ?? 1) - 1;
    if (remaining > 0) this.ownerPending.set(request.ownerId, remaining);
    else this.ownerPending.delete(request.ownerId);
  }

  private recoverWorker(worker: PlannerWorker, cause: Error, timeout = false) {
    if (worker !== this.worker || this.closed) return;
    this.worker = undefined;
    if (this.active) {
      const request = this.active;
      this.active = undefined;
      this.finish(request);
      request.reject(new PlannerServiceError(timeout ? 'PLANNER_TIMEOUT' : 'PLANNER_WORKER_FAILED', cause.message));
    }
    void worker.terminate().catch(() => {});
    try {
      this.spawnWorker();
      this.dispatch();
    } catch (error) {
      this.rejectQueued(new PlannerServiceError(
        'PLANNER_WORKER_FAILED',
        error instanceof Error ? error.message : 'PLANNER_WORKER_FAILED',
      ));
    }
  }

  private rejectQueued(error: Error) {
    for (const queue of this.queues.values()) for (const request of queue) {
      this.finish(request);
      request.reject(error);
    }
    this.queues.clear();
  }

  private timeout(request: Request) {
    if (this.active === request && this.worker) {
      this.recoverWorker(this.worker, new Error('Planner request timed out'), true);
      return;
    }
    const queue = this.queues.get(request.ownerId), index = queue?.indexOf(request) ?? -1;
    if (queue && index >= 0) {
      queue.splice(index, 1);
      if (queue.length === 0) this.queues.delete(request.ownerId);
      this.finish(request);
      request.reject(new PlannerServiceError('PLANNER_TIMEOUT'));
    }
  }

  private dispatch() {
    if (this.closed || this.active || !this.worker || this.queues.size === 0) return;
    const owners = [...this.queues.keys()],
      ownerId = owners.find((owner) => owner !== this.lastOwnerId) ?? owners[0],
      queue = this.queues.get(ownerId)!,
      request = queue.shift()!;
    if (queue.length === 0) this.queues.delete(ownerId);
    this.active = request;
    this.lastOwnerId = ownerId;
    try {
      this.worker.postMessage({ id: request.id, ship: request.ship, target: request.target });
    } catch (error) {
      this.recoverWorker(
        this.worker,
        error instanceof Error ? error : new Error('Planner worker rejected request'),
      );
    }
  }

  plan(ship: ShipState, target: ManeuverTarget, ownerId = 'local'): Promise<ManeuverPlanResult> {
    if (this.closed) return Promise.reject(new PlannerServiceError('PLANNER_CLOSED'));
    if ((this.ownerPending.get(ownerId) ?? 0) >= this.maxRequestsPerOwner)
      return Promise.reject(new PlannerServiceError('PLANNER_BUSY'));
    const queuedCount = [...this.queues.values()].reduce((sum, queue) => sum + queue.length, 0);
    if (queuedCount >= this.maxQueuedRequests)
      return Promise.reject(new PlannerServiceError('PLANNER_QUEUE_FULL'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const request: Request = {
        id, ownerId, ship: structuredClone(ship), target: structuredClone(target), resolve, reject,
        timeout: undefined as unknown as ReturnType<typeof setTimeout>,
      };
      request.timeout = setTimeout(() => this.timeout(request), this.requestTimeoutMs);
      const queue = this.queues.get(ownerId) ?? [];
      queue.push(request);
      this.queues.set(ownerId, queue);
      this.ownerPending.set(ownerId, (this.ownerPending.get(ownerId) ?? 0) + 1);
      this.dispatch();
    });
  }

  stats() {
    return {
      active: this.active ? 1 : 0,
      queued: [...this.queues.values()].reduce((sum, queue) => sum + queue.length, 0),
      owners: this.ownerPending.size,
    };
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    if (this.active) {
      const request = this.active;
      this.active = undefined;
      this.finish(request);
      request.reject(new PlannerServiceError('PLANNER_CLOSED'));
    }
    this.rejectQueued(new PlannerServiceError('PLANNER_CLOSED'));
    const worker = this.worker;
    this.worker = undefined;
    if (worker) await worker.terminate();
  }
}
