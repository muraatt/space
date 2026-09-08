import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import { CONFIG, SCENES, neutralControls, type ServerMessage, type SceneId } from '@orbital/shared';
import type { World } from '../world';
import { dispatch } from '../commands/dispatch';
import { PlannerService } from '../planner/service';
import { generateMissionPool, MISSION_TARGETS } from '../missions/generator';
export function attachGateway(server: Server, world: World, testMode: boolean) {
  const planner = new PlannerService();
  const plans = new Map<string, Awaited<ReturnType<PlannerService['plan']>>>(),
    consumedPlans = new Set<string>();
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: CONFIG.maxPayloadBytes,
    perMessageDeflate: false,
  });
  let owner: WebSocket | undefined;
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const origin = req.headers.origin;
    if (
      url.pathname !== '/socket' ||
      (origin && !/^http:\/\/(localhost|127\.0\.0\.1):(5173|4173|5174)$/.test(origin))
    ) {
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      // A refreshed/new local tab takes the single development pilot lease.
      owner?.close(4001, 'Pilot moved to another local tab');
      plans.clear();
      consumedPlans.clear();
      world.state.controls = neutralControls();
      owner = ws;
      const scene = url.searchParams.get('scene');
      if (url.searchParams.get('resume') !== '1' && !world.paused && SCENES.includes(scene as SceneId))
        world.reset(scene as SceneId);
      wss.emit('connection', ws);
    });
  });
  const send = (ws: WebSocket, msg: ServerMessage) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };
  wss.on('connection', (ws) => {
    send(ws, { type: 'welcome', version: 1, shipId: world.state.ship.id, testMode });
    let windowAt = performance.now(),
      count = 0;
    ws.on('error', () => {});
    ws.on('message', async (raw) => {
      if (owner !== ws) return;
      const now = performance.now();
      if (now - windowAt >= 1000) {
        count = 0;
        windowAt = now;
      }
      if (++count > CONFIG.maxCommandsPerSecond) {
        world.rejectedCommands++;
        send(ws, { type: 'error', code: 'RATE_LIMIT' });
        return;
      }
      try {
        const result = dispatch(world.state, JSON.parse(raw.toString()), world.state.profile.activeShipId);
        if (!result.ok) {
          world.rejectedCommands++;
          send(ws, { type: 'error', code: result.code });
          return;
        }
        if ('pong' in result && result.pong !== undefined) send(ws, { type: 'pong', sentAt: result.pong });
        else if ('planRequest' in result && result.planRequest !== undefined) {
          const plan = await planner.plan(world.state.ship, result.planRequest.target);
          if (owner !== ws) return;
          plans.set(result.planRequest.requestId, plan);
          send(ws, {
            type: 'maneuver_plan',
            requestId: result.planRequest.requestId,
            result: plan,
          });
        } else if ('executeRequest' in result && result.executeRequest !== undefined) {
          if (consumedPlans.has(result.executeRequest.planId)) {
            send(ws, { type: 'error', code: 'DUPLICATE_EXECUTION' });
            return;
          }
          const plan = plans.get(result.executeRequest.planId),
            candidate = plan?.candidates.find((item) => item.type === result.executeRequest.candidateType);
          if (!candidate) {
            send(ws, { type: 'error', code: 'UNKNOWN_PLAN' });
            return;
          }
          const started = world.startManeuver(result.executeRequest.planId, candidate, Date.now());
          if (!started.ok) {
            send(ws, { type: 'error', code: started.code });
            return;
          }
          plans.delete(result.executeRequest.planId);
          consumedPlans.add(result.executeRequest.planId);
          send(ws, { type: 'maneuver_ack', action: 'EXECUTE', executionId: started.executionId });
        } else if ('cancelRequest' in result && result.cancelRequest !== undefined) {
          const cancelled = world.cancelManeuver(result.cancelRequest.executionId, Date.now());
          if (!cancelled.ok) {
            send(ws, { type: 'error', code: cancelled.code });
            return;
          }
          send(ws, { type: 'maneuver_ack', action: 'CANCEL', executionId: cancelled.executionId });
        } else if ('factionRequest' in result && result.factionRequest !== undefined) {
          const selected = world.chooseFaction(result.factionRequest.factionId);
          if (!selected.ok) send(ws, { type: 'error', code: selected.code });
          else send(ws, { type: 'mission_ack', action: 'FACTION' });
        } else if ('missionListRequest' in result && result.missionListRequest !== undefined) {
          const factionId = world.state.profile.factionId;
          if (!factionId) {
            send(ws, { type: 'error', code: 'FACTION_REQUIRED' });
            return;
          }
          const [cargoPlan, reconnaissancePlan, interceptionPlan] = await Promise.all([
            planner.plan(world.state.ship, MISSION_TARGETS.cargo),
            planner.plan(world.state.ship, MISSION_TARGETS.reconnaissance),
            planner.plan(world.state.ship, MISSION_TARGETS.interception),
          ]);
          if (owner !== ws) return;
          const refreshed = world.setMissionOffers(
            generateMissionPool(
              factionId,
              cargoPlan,
              reconnaissancePlan,
              (Math.hypot(...world.state.ship.position) - CONFIG.earthRadius) / 1000,
              world.state.ship.performance.cargoCapacityKg,
              interceptionPlan,
            ),
          );
          if (!refreshed.ok) send(ws, { type: 'error', code: refreshed.code });
          else send(ws, { type: 'mission_ack', action: 'REFRESH' });
        } else if ('missionAcceptRequest' in result && result.missionAcceptRequest !== undefined) {
          const accepted = world.acceptMission(result.missionAcceptRequest.missionId, Date.now());
          if (!accepted.ok) send(ws, { type: 'error', code: accepted.code });
          else
            send(ws, {
              type: 'mission_ack',
              action: 'ACCEPT',
              missionId: result.missionAcceptRequest.missionId,
            });
        } else if ('cargoDeliveryRequest' in result && result.cargoDeliveryRequest !== undefined) {
          const delivered = world.deliverCargo(
            result.cargoDeliveryRequest.missionId,
            result.cargoDeliveryRequest.cargoId,
            result.cargoDeliveryRequest.destinationId,
            Date.now(),
          );
          if (!delivered.ok) send(ws, { type: 'error', code: delivered.code });
          else
            send(ws, {
              type: 'mission_ack',
              action: 'DELIVER',
              missionId: result.cargoDeliveryRequest.missionId,
            });
        } else if ('scanRequest' in result && result.scanRequest !== undefined) {
          const scanning = world.startScan(result.scanRequest.missionId, result.scanRequest.destinationId);
          if (!scanning.ok) send(ws, { type: 'error', code: scanning.code });
          else send(ws, { type: 'mission_ack', action: 'SCAN', missionId: result.scanRequest.missionId });
        } else if ('missionAbandonRequest' in result && result.missionAbandonRequest !== undefined) {
          const abandoned = world.abandonMission(result.missionAbandonRequest.missionId, Date.now());
          if (!abandoned.ok) send(ws, { type: 'error', code: abandoned.code });
          else
            send(ws, {
              type: 'mission_ack',
              action: 'ABANDON',
              missionId: result.missionAbandonRequest.missionId,
            });
        } else if ('identifyRequest' in result && result.identifyRequest !== undefined) {
          const identified = world.identifyTarget(
            result.identifyRequest.missionId,
            result.identifyRequest.destinationId,
            Date.now(),
          );
          if (!identified.ok) send(ws, { type: 'error', code: identified.code });
          else
            send(ws, {
              type: 'mission_ack',
              action: 'IDENTIFY',
              missionId: result.identifyRequest.missionId,
            });
        } else if ('targetSelectionRequest' in result && result.targetSelectionRequest !== undefined) {
          const selected = world.selectCombatTarget(
            result.targetSelectionRequest.targetId,
            result.targetSelectionRequest.commandId,
            Date.now(),
          );
          if (!selected.ok) send(ws, { type: 'error', code: selected.code });
          else
            send(ws, {
              type: 'combat_ack',
              action: 'TARGET',
              commandId: result.targetSelectionRequest.commandId,
            });
        } else if ('targetClearRequest' in result && result.targetClearRequest !== undefined) {
          const cleared = world.clearCombatTarget(result.targetClearRequest.commandId, Date.now());
          if (!cleared.ok) send(ws, { type: 'error', code: cleared.code });
          else
            send(ws, {
              type: 'combat_ack',
              action: 'CLEAR_TARGET',
              commandId: result.targetClearRequest.commandId,
            });
        } else if ('laserRequest' in result && result.laserRequest !== undefined) {
          const fired = world.fireLaser(result.laserRequest.commandId, Date.now());
          if (!fired.ok) send(ws, { type: 'error', code: fired.code });
          else send(ws, { type: 'combat_ack', action: 'LASER', commandId: result.laserRequest.commandId });
        } else if ('missileRequest' in result && result.missileRequest !== undefined) {
          const fired = world.fireMissile(result.missileRequest.commandId, Date.now());
          if (!fired.ok) send(ws, { type: 'error', code: fired.code });
          else
            send(ws, { type: 'combat_ack', action: 'MISSILE', commandId: result.missileRequest.commandId });
        } else if ('countermeasureRequest' in result && result.countermeasureRequest !== undefined) {
          const activated = world.activateCountermeasure(result.countermeasureRequest.commandId, Date.now());
          if (!activated.ok) send(ws, { type: 'error', code: activated.code });
          else
            send(ws, {
              type: 'combat_ack',
              action: 'COUNTERMEASURE',
              commandId: result.countermeasureRequest.commandId,
            });
        } else if ('recoveryRequest' in result && result.recoveryRequest !== undefined) {
          const claimed = world.claimReplacement(result.recoveryRequest.transactionId, Date.now());
          if (!claimed.ok) send(ws, { type: 'error', code: claimed.code });
          else
            send(ws, {
              type: 'combat_ack',
              action: 'RECOVERY',
              commandId: result.recoveryRequest.transactionId,
            });
        } else if ('shipSelectionRequest' in result && result.shipSelectionRequest !== undefined) {
          const selected = world.selectShip(
            result.shipSelectionRequest.targetShipId,
            result.shipSelectionRequest.transactionId,
          );
          if (!selected.ok) send(ws, { type: 'error', code: selected.code });
          else
            send(ws, {
              type: 'economy_ack',
              action: 'SELECT_SHIP',
              transactionId: result.shipSelectionRequest.transactionId,
              credits: world.state.profile.credits,
            });
        } else if ('fuelRequest' in result && result.fuelRequest !== undefined) {
          const purchased = world.buyFuel(result.fuelRequest.amountKg, result.fuelRequest.transactionId);
          if (!purchased.ok) send(ws, { type: 'error', code: purchased.code });
          else
            send(ws, {
              type: 'economy_ack',
              action: 'FUEL',
              transactionId: result.fuelRequest.transactionId,
              credits: world.state.profile.credits,
            });
        } else if ('repairRequest' in result && result.repairRequest !== undefined) {
          const repaired = world.repairShip(result.repairRequest.transactionId);
          if (!repaired.ok) send(ws, { type: 'error', code: repaired.code });
          else
            send(ws, {
              type: 'economy_ack',
              action: 'REPAIR',
              transactionId: result.repairRequest.transactionId,
              credits: world.state.profile.credits,
            });
        } else if ('ammunitionRequest' in result && result.ammunitionRequest !== undefined) {
          const purchased = world.buyAmmunition(
            result.ammunitionRequest.amountKg,
            result.ammunitionRequest.transactionId,
          );
          if (!purchased.ok) send(ws, { type: 'error', code: purchased.code });
          else
            send(ws, {
              type: 'economy_ack',
              action: 'AMMUNITION',
              transactionId: result.ammunitionRequest.transactionId,
              credits: world.state.profile.credits,
            });
        } else if ('upgradeRequest' in result && result.upgradeRequest !== undefined) {
          const installed = world.installUpgrade(
            result.upgradeRequest.upgradeId,
            result.upgradeRequest.transactionId,
          );
          if (!installed.ok) send(ws, { type: 'error', code: installed.code });
          else
            send(ws, {
              type: 'economy_ack',
              action: 'UPGRADE',
              transactionId: result.upgradeRequest.transactionId,
              credits: world.state.profile.credits,
            });
        } else world.lastInputAt = now;
      } catch {
        world.rejectedCommands++;
        send(ws, { type: 'error', code: 'INVALID_JSON' });
      }
    });
    ws.on('close', () => {
      if (owner === ws) {
        owner = undefined;
        world.state.controls = neutralControls();
      }
    });
  });
  return {
    broadcast(backlogMs: number) {
      const snapshot: ServerMessage = {
        type: 'snapshot',
        version: 1,
        state: world.state,
        serverNowMs: Date.now(),
        metrics: world.metrics(backlogMs),
        paused: world.paused,
      };
      for (const ws of wss.clients) {
        if (ws.bufferedAmount > 1024 * 1024) {
          ws.close(1013, 'Slow client');
          continue;
        }
        if (ws.bufferedAmount < 128 * 1024) send(ws, snapshot);
      }
    },
    close() {
      for (const ws of wss.clients) ws.close();
      wss.close();
      void planner.close();
    },
  };
}
