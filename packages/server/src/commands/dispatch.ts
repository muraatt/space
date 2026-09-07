import { CONFIG, clientMessageSchema, type WorldState } from '@orbital/shared';
export function dispatch(world: WorldState, data: unknown, ownedShipId: string) {
  const parsed = clientMessageSchema.safeParse(data);
  if (!parsed.success) return { ok: false as const, code: 'INVALID_COMMAND' };
  const c = parsed.data;
  if (c.type === 'ping') return { ok: true as const, pong: c.sentAt };
  if (c.shipId !== ownedShipId || c.shipId !== world.ship.id)
    return { ok: false as const, code: 'NOT_OWNER' };
  if (c.type === 'plan_maneuver')
    return {
      ok: true as const,
      planRequest: { requestId: c.requestId, target: c.target },
    };
  if (c.type === 'execute_maneuver')
    return {
      ok: true as const,
      executeRequest: { planId: c.planId, candidateType: c.candidateType },
    };
  if (c.type === 'cancel_maneuver')
    return {
      ok: true as const,
      cancelRequest: { executionId: c.executionId },
    };
  if (
    world.maneuver &&
    ['PLANNED', 'EXECUTING_BURN', 'COASTING', 'ARRIVAL_BURN'].includes(world.maneuver.status)
  )
    return { ok: false as const, code: 'MANEUVER_ACTIVE' };
  if (c.seq <= world.lastInputSeq) return { ok: false as const, code: 'STALE_SEQUENCE' };
  world.controls = { translation: c.translation, rotation: c.rotation };
  world.lastInputSeq = c.seq;
  return { ok: true as const, version: CONFIG.protocolVersion };
}
