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
  z.strictObject({
    type: z.literal('choose_faction'),
    version: z.literal(1),
    shipId: z.string().max(64),
    factionId: z.enum(['AURORA', 'VANGUARD']),
  }),
  z.strictObject({
    type: z.literal('request_missions'),
    version: z.literal(1),
    shipId: z.string().max(64),
  }),
  z.strictObject({
    type: z.literal('accept_mission'),
    version: z.literal(1),
    shipId: z.string().max(64),
    missionId: z.string().min(1).max(96),
  }),
  z.strictObject({
    type: z.literal('deliver_cargo'),
    version: z.literal(1),
    shipId: z.string().max(64),
    missionId: z.string().min(1).max(96),
    cargoId: z.string().min(1).max(96),
    destinationId: z.string().min(1).max(96),
  }),
  z.strictObject({
    type: z.literal('start_scan'),
    version: z.literal(1),
    shipId: z.string().max(64),
    missionId: z.string().min(1).max(96),
    destinationId: z.string().min(1).max(96),
  }),
  z.strictObject({
    type: z.literal('abandon_mission'),
    version: z.literal(1),
    shipId: z.string().max(64),
    missionId: z.string().min(1).max(96),
  }),
  z.strictObject({
    type: z.literal('identify_target'),
    version: z.literal(1),
    shipId: z.string().max(64),
    missionId: z.string().min(1).max(96),
    destinationId: z.string().min(1).max(96),
  }),
  z.strictObject({
    type: z.literal('select_target'),
    version: z.literal(1),
    shipId: z.string().max(64),
    targetId: z.string().min(1).max(96),
    commandId: z.string().min(1).max(96),
  }),
  z.strictObject({
    type: z.literal('clear_target'),
    version: z.literal(1),
    shipId: z.string().max(64),
    commandId: z.string().min(1).max(96),
  }),
  z.strictObject({
    type: z.literal('fire_laser'),
    version: z.literal(1),
    shipId: z.string().max(64),
    commandId: z.string().min(1).max(96),
  }),
  z.strictObject({
    type: z.literal('fire_missile'),
    version: z.literal(1),
    shipId: z.string().max(64),
    commandId: z.string().min(1).max(96),
  }),
  z.strictObject({
    type: z.literal('activate_countermeasure'),
    version: z.literal(1),
    shipId: z.string().max(64),
    commandId: z.string().min(1).max(96),
  }),
  z.strictObject({
    type: z.literal('claim_replacement'),
    version: z.literal(1),
    shipId: z.string().max(64),
    transactionId: z.string().min(1).max(96),
  }),
  z.strictObject({
    type: z.literal('select_ship'),
    version: z.literal(1),
    shipId: z.string().max(64),
    targetShipId: z.string().min(1).max(64),
    transactionId: z.string().min(1).max(96),
  }),
  z.strictObject({
    type: z.literal('buy_fuel'),
    version: z.literal(1),
    shipId: z.string().max(64),
    amountKg: z.number().finite().positive().max(10_000),
    transactionId: z.string().min(1).max(96),
  }),
  z.strictObject({
    type: z.literal('repair_ship'),
    version: z.literal(1),
    shipId: z.string().max(64),
    transactionId: z.string().min(1).max(96),
  }),
  z.strictObject({
    type: z.literal('buy_ammunition'),
    version: z.literal(1),
    shipId: z.string().max(64),
    amountKg: z.number().finite().positive().max(10_000),
    transactionId: z.string().min(1).max(96),
  }),
  z.strictObject({
    type: z.literal('install_upgrade'),
    version: z.literal(1),
    shipId: z.string().max(64),
    upgradeId: z.string().min(1).max(96),
    transactionId: z.string().min(1).max(96),
  }),
]);
export type InputCommand = z.infer<typeof controlSchema>;
export const scenarioResetSchema = z.strictObject({
  startOrbitAltitudeKm: z.literal(800).optional(),
  scene: z.enum([
    'orbit_day',
    'orbit_night',
    'orbit_maneuver',
    'low_fuel',
    'cargo_mission',
    'intercept',
    'missile_hit',
  ]),
  paused: z.boolean().default(false),
  seed: z.number().int().default(4401),
});
