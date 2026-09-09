import { CONFIG } from '@orbital/shared';

export class ManeuverPlanStore<T> {
  private readonly plans = new Map<string, { value: T; expiresAtMs: number }>();
  private readonly consumed = new Map<string, number>();

  constructor(
    private readonly capacity: number = CONFIG.maneuverPlanCapacityPerConnection,
    private readonly ttlMs: number = CONFIG.maneuverPlanTtlMs,
  ) {}

  cleanup(nowMs: number) {
    for (const [id, entry] of this.plans) if (entry.expiresAtMs <= nowMs) this.plans.delete(id);
    for (const [id, expiresAtMs] of this.consumed) if (expiresAtMs <= nowMs) this.consumed.delete(id);
  }

  set(id: string, value: T, nowMs: number) {
    this.cleanup(nowMs);
    if (!this.plans.has(id) && this.plans.size >= this.capacity) return false;
    this.plans.set(id, { value, expiresAtMs: nowMs + this.ttlMs });
    return true;
  }

  get(id: string, nowMs: number) {
    this.cleanup(nowMs);
    return this.plans.get(id)?.value;
  }

  delete(id: string) { this.plans.delete(id); }

  consume(id: string, nowMs: number) {
    this.plans.delete(id);
    this.consumed.set(id, nowMs + this.ttlMs);
    while (this.consumed.size > this.capacity) this.consumed.delete(this.consumed.keys().next().value!);
  }

  wasConsumed(id: string, nowMs: number) {
    this.cleanup(nowMs);
    return this.consumed.has(id);
  }

  get size() { return this.plans.size; }
}
