import { z } from 'zod';
const axis = z.number().finite().min(-1).max(1);
const axes = z.tuple([axis, axis, axis]);
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
]);
export type InputCommand = z.infer<typeof controlSchema>;
export const scenarioResetSchema = z.strictObject({
  scene: z.enum(['orbit_day', 'orbit_night']),
  paused: z.boolean().default(false),
  seed: z.number().int().default(4401),
});
