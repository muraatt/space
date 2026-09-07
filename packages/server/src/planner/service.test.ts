import { afterEach, describe, expect, it } from 'vitest';
import { CONFIG } from '@orbital/shared';
import { initialWorld } from '@orbital/simulation';
import { PlannerService } from './service';

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
});
