import { z } from 'zod';
const axis = z.number().finite().min(-1).max(1);
const axes = z.tuple([axis, axis, axis]);
const finiteVec3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
export const controlSchema = z.strictObject({
  type: z.literal('input'),
  version: z.literal(1),
  shipId: z.string().max(64),
  seq: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  translation: axes,
  rotation: axes,
});
export const clientMessageSchema = z.discriminatedUnion('type', [
  controlSchema,
  z.strictObject({ type: z.literal('ping'), sentAt: z.number().finite().nonnegative() }),
  z.strictObject({
    type: z.literal('plan_maneuver'),
    version: z.literal(1),
    shipId: z.string().max(64),
    requestId: z.string().min(1).max(64),
    target: z.discriminatedUnion('kind', [
      z.strictObject({
        kind: z.literal('CIRCULAR_ORBIT'),
        radiusM: z.number().finite(),
        phaseAheadRad: z.number().finite(),
      }),
      z.strictObject({
        kind: z.literal('NEAR_RENDEZVOUS_STATE'),
        state: z.strictObject({ position: finiteVec3, velocity: finiteVec3 }),
      }),
    ]),
  }),
  z.strictObject({
    type: z.literal('execute_maneuver'),
    version: z.literal(1),
    shipId: z.string().max(64),
    planId: z.string().min(1).max(64),
    candidateType: z.enum(['ECONOMIC', 'BALANCED', 'FAST']),
  }),
  z.strictObject({
    type: z.literal('cancel_maneuver'),
    version: z.literal(1),
    shipId: z.string().max(64),
    executionId: z.string().min(1).max(96),
  }),
]);
export type InputCommand = z.infer<typeof controlSchema>;
export const scenarioResetSchema = z.strictObject({
  scene: z.enum(['orbit_day', 'orbit_night', 'orbit_maneuver', 'low_fuel']),
  paused: z.boolean().default(false),
  seed: z.number().int().default(4401),
});
