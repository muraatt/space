import { describe, expect, it } from 'vitest';
import { controlSchema, clientMessageSchema } from './protocol';
const input = {
  type: 'input',
  version: 1,
  shipId: 'kestrel-01',
  seq: 1,
  translation: [0, 0, -1],
  rotation: [0, 0, 0],
};
describe('untrusted wire commands', () => {
  it('accepts bounded control intent', () => expect(controlSchema.safeParse(input).success).toBe(true));
  it.each([NaN, Infinity, -Infinity, 1.01, -1.01])('rejects invalid axis %s', (value) =>
    expect(controlSchema.safeParse({ ...input, translation: [value, 0, 0] }).success).toBe(false),
  );
  it.each([{ position: [0, 0, 0] }, { money: 1000 }, { damage: 50 }, { velocity: [1, 2, 3] }])(
    'rejects authoritative result fields %s',
    (extra) => expect(controlSchema.safeParse({ ...input, ...extra }).success).toBe(false),
  );
  it('rejects unknown type/version and fractional sequence', () => {
    expect(clientMessageSchema.safeParse({ type: 'teleport' }).success).toBe(false);
    expect(controlSchema.safeParse({ ...input, version: 2 }).success).toBe(false);
    expect(controlSchema.safeParse({ ...input, seq: 0.5 }).success).toBe(false);
  });
  it('accepts versioned maneuver intent but rejects forged planner output', () => {
    const request = {
      type: 'plan_maneuver',
      version: 1,
      shipId: 'kestrel-01',
      requestId: 'plan-1',
      target: { kind: 'CIRCULAR_ORBIT', radiusM: 7_178_137, phaseAheadRad: 0.5 },
    };
    expect(clientMessageSchema.safeParse(request).success).toBe(true);
    expect(clientMessageSchema.safeParse({ ...request, estimatedDeltaVMps: 0 }).success).toBe(false);
  });
  it('accepts plan references for execute/cancel and rejects authoritative payloads', () => {
    const execute = {
      type: 'execute_maneuver',
      version: 1,
      shipId: 'kestrel-01',
      planId: 'plan-1',
      candidateType: 'ECONOMIC',
    };
    expect(clientMessageSchema.safeParse(execute).success).toBe(true);
    expect(clientMessageSchema.safeParse({ ...execute, propellantKg: 2000 }).success).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        type: 'cancel_maneuver',
        version: 1,
        shipId: 'kestrel-01',
        executionId: 'plan-1:ECONOMIC',
      }).success,
    ).toBe(true);
  });
});
