import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { CONFIG, SCENES, identityMessageSchema, neutralControls, type ManeuverTarget, type ServerMessage, type SceneId } from '@orbital/shared';
import type { World } from '../world';
import { dispatch } from '../commands/dispatch';
import { PlannerService } from '../planner/service';
import { generateBountyPool, generateMissionPool, MISSION_TARGETS } from '../missions/generator';
import { IdentityConflict } from '../identity/file-identity-repository';
import type { SharedPilotRuntime } from '../shared-sandbox';
import { SharedSandbox } from '../shared-sandbox';
export function attachGateway(server: Server, sandbox: SharedSandbox, testMode: boolean) {
  const planner = new PlannerService();
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: CONFIG.maxPayloadBytes,
    perMessageDeflate: false,
  });
  const socketUrls = new WeakMap<WebSocket, URL>(), sessions = new Map<WebSocket, { world: World; runtime?: SharedPilotRuntime }>(),
    playerSockets = new Map<string, WebSocket>();
  let legacyOwner: WebSocket | undefined;
  const configuredOrigins = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  const originAllowed = (origin?: string) => (testMode && !origin) || (!!origin && (
    configuredOrigins.length
      ? configuredOrigins.includes(origin)
      : /^http:\/\/(localhost|127\.0\.0\.1):(5173|4173|5174)$/.test(origin)
  ));
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const origin = req.headers.origin;
    if (
      url.pathname !== '/socket' ||
      !originAllowed(origin)
    ) {
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      socketUrls.set(ws, url);
      wss.emit('connection', ws);
    });
  });
  const send = (ws: WebSocket, msg: ServerMessage) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };
  wss.on('connection', (ws) => {
    const url = socketUrls.get(ws) ?? new URL('/socket', 'http://127.0.0.1'), legacy = testMode && url.searchParams.get('legacy') === '1';
    let world = sandbox.legacyWorld, runtime: SharedPilotRuntime | undefined, authenticated = legacy;
    const plans = new Map<string, { plan: Awaited<ReturnType<PlannerService['plan']>>; targetEntityId?: string }>(),
      consumedPlans = new Set<string>();
    if (legacy) {
      legacyOwner?.close(4001, 'Pilot moved to another local tab');
      legacyOwner = ws;
      world.state.controls = neutralControls();
      const scene = url.searchParams.get('scene');
      if (url.searchParams.get('resume') !== '1' && !world.paused && SCENES.includes(scene as SceneId)) world.reset(scene as SceneId);
      send(ws, { type: 'welcome', version: 1, shipId: world.state.ship.id, testMode });
      sessions.set(ws, { world });
    } else send(ws, { type: 'identity_required', reason: 'MISSING_CREDENTIAL', registrationCredential: randomBytes(32).toString('base64url') });
    let windowAt = performance.now(),
      count = 0;
    ws.on('error', () => {});
    ws.on('message', async (raw) => {
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
        const incoming: unknown = JSON.parse(raw.toString());
        if (!authenticated) {
          const identity = identityMessageSchema.safeParse(incoming);
          if (!identity.success) { send(ws, { type: 'identity_error', code: 'INVALID_CREDENTIAL' }); return; }
          try {
            const isRegistration = identity.data.type === 'register_identity';
            const result = identity.data.type === 'register_identity'
              ? await sandbox.register(identity.data.username, identity.data.credential)
              : await sandbox.resume(identity.data.credential);
            if (!result) { send(ws, { type: 'identity_required', reason: 'INVALID_CREDENTIAL', registrationCredential: randomBytes(32).toString('base64url') }); return; }
            runtime = result.runtime; world = runtime.world; authenticated = true; sandbox.connect(runtime);
            const previous = playerSockets.get(result.record.playerId);
            if (previous && previous !== ws) previous.close(4001, 'Identity resumed in another tab');
            playerSockets.set(result.record.playerId, ws); sessions.set(ws, { world, runtime });
            send(ws, {
              type: 'identity_established', identity: sandbox.identity(result.record),
              credential: isRegistration ? (result as Awaited<ReturnType<SharedSandbox['register']>>).credential : undefined,
              restored: !isRegistration,
            });
            send(ws, { type: 'welcome', version: 1, shipId: world.state.ship.id, testMode });
          } catch (error) {
            const code = error instanceof IdentityConflict ? 'USERNAME_TAKEN'
              : error instanceof RangeError ? 'USERNAME_INVALID' : 'INVALID_CREDENTIAL';
            send(ws, { type: 'identity_error', code });
          }
          return;
        }
        const result = dispatch(world.state, incoming, world.state.profile.activeShipId);
        if (!result.ok) {
          world.rejectedCommands++;
          send(ws, { type: 'error', code: result.code });
          return;
        }
        if ('pong' in result && result.pong !== undefined) send(ws, { type: 'pong', sentAt: result.pong });
        else if ('planRequest' in result && result.planRequest !== undefined) {
          let target: ManeuverTarget, targetEntityId: string | undefined;
          if (result.planRequest.target.kind === 'STATION_RENDEZVOUS') {
            const resolved = world.stationManeuverTarget(result.planRequest.target.stationId);
            if (!resolved) {
              send(ws, { type: 'error', code: 'UNKNOWN_STATION' });
              return;
            }
            target = resolved;
            targetEntityId = result.planRequest.target.stationId;
          } else if (result.planRequest.target.kind === 'ORBITAL_ENTITY_INTERCEPT') {
            const resolved = world.orbitalEntityManeuverTarget(result.planRequest.target.entityId);
            if (!resolved) {
              send(ws, { type: 'error', code: 'UNKNOWN_ORBITAL_TARGET' });
              return;
            }
            target = resolved;
            targetEntityId = result.planRequest.target.entityId;
          } else target = result.planRequest.target;
          const plan = await planner.plan(world.state.ship, target);
          if (ws.readyState !== WebSocket.OPEN || !authenticated) return;
          plans.set(result.planRequest.requestId, { plan, targetEntityId });
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
          const planRecord = plans.get(result.executeRequest.planId),
            candidate = planRecord?.plan.candidates.find((item) => item.type === result.executeRequest.candidateType);
          if (!candidate) {
            send(ws, { type: 'error', code: 'UNKNOWN_PLAN' });
            return;
          }
          const started = world.startManeuver(
            result.executeRequest.planId,
            candidate,
            Date.now(),
            planRecord?.targetEntityId,
          );
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
          const bountyTargets = world.state.combat.contacts.filter((item) => item.bountyClass && !item.destroyed),
            bountyPlanEntries = world.state.docking.phase === 'DOCKED'
              ? await Promise.all(bountyTargets.map(async (item) => [item.id, await planner.plan(world.state.ship, {
                  kind: 'NEAR_RENDEZVOUS_STATE',
                  state: { position: [...item.position], velocity: [...item.velocity] },
                })] as const))
              : [],
            bountyPlans = new Map(bountyPlanEntries);
          if (ws.readyState !== WebSocket.OPEN || !authenticated) return;
          const refreshed = world.setMissionOffers(
            [...generateMissionPool(
              factionId,
              cargoPlan,
              reconnaissancePlan,
              (Math.hypot(...world.state.ship.position) - CONFIG.earthRadius) / 1000,
              world.state.ship.performance.cargoCapacityKg,
              interceptionPlan,
            ), ...generateBountyPool(factionId, bountyTargets, bountyPlans)],
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
        } else if ('stationSelectionRequest' in result && result.stationSelectionRequest !== undefined) {
          const selected = world.selectStation(
            result.stationSelectionRequest.stationId,
            result.stationSelectionRequest.commandId,
          );
          if (!selected.ok) send(ws, { type: 'error', code: selected.code });
          else send(ws, { type: 'docking_ack', action: 'SELECT_STATION', commandId: result.stationSelectionRequest.commandId });
        } else if ('dockingRequest' in result && result.dockingRequest !== undefined) {
          const docked = world.requestDock(
            result.dockingRequest.stationId,
            result.dockingRequest.portId,
            result.dockingRequest.commandId,
            Date.now(),
          );
          if (!docked.ok) send(ws, { type: 'error', code: docked.code });
          else send(ws, { type: 'docking_ack', action: 'DOCK', commandId: result.dockingRequest.commandId });
        } else if ('undockRequest' in result && result.undockRequest !== undefined) {
          const undocked = world.undock(result.undockRequest.stationId, result.undockRequest.commandId);
          if (!undocked.ok) send(ws, { type: 'error', code: undocked.code });
          else send(ws, { type: 'docking_ack', action: 'UNDOCK', commandId: result.undockRequest.commandId });
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
            result.shipSelectionRequest.stationId,
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
          const purchased = world.buyFuel(
            result.fuelRequest.amountKg,
            result.fuelRequest.transactionId,
            result.fuelRequest.stationId,
          );
          if (!purchased.ok) send(ws, { type: 'error', code: purchased.code });
          else
            send(ws, {
              type: 'economy_ack',
              action: 'FUEL',
              transactionId: result.fuelRequest.transactionId,
              credits: world.state.profile.credits,
            });
        } else if ('repairRequest' in result && result.repairRequest !== undefined) {
          const repaired = world.repairShip(result.repairRequest.transactionId, result.repairRequest.stationId);
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
            result.ammunitionRequest.stationId,
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
            result.upgradeRequest.stationId,
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
      sessions.delete(ws);
      if (runtime) {
        if (playerSockets.get(runtime.record.playerId) === ws) playerSockets.delete(runtime.record.playerId);
        sandbox.disconnect(runtime);
      } else if (legacy) {
        if (legacyOwner === ws) legacyOwner = undefined;
        world.state.controls = neutralControls();
      }
    });
  });
  return {
    broadcast(backlogMs: number) {
      sandbox.prepareSnapshots();
      for (const ws of wss.clients) {
        if (ws.bufferedAmount > 1024 * 1024) {
          ws.close(1013, 'Slow client');
          continue;
        }
        const session = sessions.get(ws);
        if (session && ws.bufferedAmount < 128 * 1024) send(ws, {
          type: 'snapshot', version: 1, state: session.world.state, serverNowMs: Date.now(),
          metrics: session.world.metrics(backlogMs), paused: session.world.paused,
        });
      }
    },
    close() {
      for (const ws of wss.clients) ws.terminate();
      wss.close();
      void planner.close();
    },
  };
}
