import { CONFIG, clientMessageSchema, type WorldState } from '@orbital/shared';
export function dispatch(world: WorldState, data: unknown, ownedShipId: string) {
  const parsed = clientMessageSchema.safeParse(data);
  if (!parsed.success) return { ok: false as const, code: 'INVALID_COMMAND' };
  const c = parsed.data;
  if (c.type === 'ping') return { ok: true as const, pong: c.sentAt };
  if (c.shipId !== ownedShipId || c.shipId !== world.ship.id)
    return { ok: false as const, code: 'NOT_OWNER' };
  if (c.type === 'claim_replacement')
    return { ok: true as const, recoveryRequest: { transactionId: c.transactionId } };
  if (world.combat.playerDestroyed) return { ok: false as const, code: 'SHIP_DESTROYED' };
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
  if (c.type === 'choose_faction') return { ok: true as const, factionRequest: { factionId: c.factionId } };
  if (c.type === 'request_missions') return { ok: true as const, missionListRequest: true as const };
  if (c.type === 'accept_mission')
    return { ok: true as const, missionAcceptRequest: { missionId: c.missionId } };
  if (c.type === 'deliver_cargo')
    return {
      ok: true as const,
      cargoDeliveryRequest: {
        missionId: c.missionId,
        cargoId: c.cargoId,
        destinationId: c.destinationId,
      },
    };
  if (c.type === 'start_scan')
    return {
      ok: true as const,
      scanRequest: { missionId: c.missionId, destinationId: c.destinationId },
    };
  if (c.type === 'abandon_mission')
    return { ok: true as const, missionAbandonRequest: { missionId: c.missionId } };
  if (c.type === 'identify_target')
    return {
      ok: true as const,
      identifyRequest: { missionId: c.missionId, destinationId: c.destinationId },
    };
  if (c.type === 'select_target')
    return { ok: true as const, targetSelectionRequest: { targetId: c.targetId, commandId: c.commandId } };
  if (c.type === 'clear_target') return { ok: true as const, targetClearRequest: { commandId: c.commandId } };
  if (c.type === 'fire_laser') return { ok: true as const, laserRequest: { commandId: c.commandId } };
  if (c.type === 'fire_missile') return { ok: true as const, missileRequest: { commandId: c.commandId } };
  if (c.type === 'activate_countermeasure')
    return { ok: true as const, countermeasureRequest: { commandId: c.commandId } };
  if (c.type === 'select_station')
    return { ok: true as const, stationSelectionRequest: { stationId: c.stationId, commandId: c.commandId } };
  if (c.type === 'request_dock')
    return { ok: true as const, dockingRequest: { stationId: c.stationId, portId: c.portId, commandId: c.commandId } };
  if (c.type === 'undock')
    return { ok: true as const, undockRequest: { stationId: c.stationId, commandId: c.commandId } };
  if (c.type === 'select_ship')
    return {
      ok: true as const,
      shipSelectionRequest: { targetShipId: c.targetShipId, stationId: c.stationId, transactionId: c.transactionId },
    };
  if (c.type === 'buy_fuel')
    return {
      ok: true as const,
      fuelRequest: { amountKg: c.amountKg, stationId: c.stationId, transactionId: c.transactionId },
    };
  if (c.type === 'repair_ship')
    return { ok: true as const, repairRequest: { stationId: c.stationId, transactionId: c.transactionId } };
  if (c.type === 'buy_ammunition')
    return {
      ok: true as const,
      ammunitionRequest: { amountKg: c.amountKg, stationId: c.stationId, transactionId: c.transactionId },
    };
  if (c.type === 'install_upgrade')
    return {
      ok: true as const,
      upgradeRequest: { upgradeId: c.upgradeId, stationId: c.stationId, transactionId: c.transactionId },
    };
  if (world.docking.phase === 'DOCKED') return { ok: false as const, code: 'DOCKED' };
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
