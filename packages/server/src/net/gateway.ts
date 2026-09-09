import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { CONFIG, SCENES, identityMessageSchema, neutralControls, type ManeuverTarget, type ServerMessage, type SceneId } from '@orbital/shared';
import type { World } from '../world';
import { dispatch } from '../commands/dispatch';
import { PlannerService, PlannerServiceError } from '../planner/service';
import { createManeuverPlanFingerprint, targetAtFingerprintEpoch, validateManeuverPlanFingerprint } from '../planner/fingerprint';
import { ManeuverPlanStore } from '../planner/plan-store';
import { generateBountyPool, generateMissionPool, MISSION_TARGETS } from '../missions/generator';
import { IdentityConflict } from '../identity/identity-repository';
import { IdentityRestoreError } from '../identity/persisted-ship';
import type { SharedPilotRuntime } from '../shared-sandbox';
import { SharedSandbox } from '../shared-sandbox';
import { RegistrationLimiter, registrationSource } from './registration-limiter';
interface GatewayOptions { replacementCloseDelayMs?: number }
export function attachGateway(
  server: Server,
  sandbox: SharedSandbox,
  testMode: boolean,
  options: GatewayOptions = {},
) {
  const planner = new PlannerService();
  const registrations = new RegistrationLimiter(), peers = new WeakMap<WebSocket, string>();
  const pendingMessages = new WeakMap<WebSocket, ServerMessage[]>();
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
      peers.set(ws, registrationSource(req.socket.remoteAddress, req.headers['x-forwarded-for']));
      wss.emit('connection', ws);
    });
  });
  const send = (ws: WebSocket, msg: ServerMessage) => {
    const pending = pendingMessages.get(ws);
    if (pending) { pending.push(msg); return; }
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };
  wss.on('connection', (ws) => {
    const url = socketUrls.get(ws) ?? new URL('/socket', 'http://127.0.0.1'), legacy = testMode && url.searchParams.get('legacy') === '1';
    let world = sandbox.legacyWorld,
      runtime: SharedPilotRuntime | undefined,
      authenticated = legacy,
      authInProgress = false,
      attached = false,
      closed = false;
    const plannerOwner = `connection:${randomBytes(12).toString('hex')}`,
      plans = new ManeuverPlanStore<{
        plan: Awaited<ReturnType<PlannerService['plan']>>;
        targetEntityId?: string;
        fingerprint: ReturnType<typeof createManeuverPlanFingerprint>;
      }>(), executingPlans = new Set<string>();
    const currentSession = () => !runtime || playerSockets.get(runtime.record.playerId) === ws;
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
      count = 0, registrationAttempts = 0;
    ws.on('error', () => {});
    ws.on('message', async (raw) => {
      let durable = false;
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
          if (authInProgress) return;
          authInProgress = true;
          try {
            const isRegistration = identity.data.type === 'register_identity';
            if (isRegistration && (++registrationAttempts > 3 || !registrations.allow(peers.get(ws) ?? 'unknown'))) {
              send(ws, { type: 'error', code: 'REGISTRATION_RATE_LIMIT' });
              ws.close(1008, 'Registration limit reached'); return;
            }
            const result = identity.data.type === 'register_identity'
              ? await sandbox.register(identity.data.username, identity.data.credential)
              : await sandbox.resume(identity.data.credential);
            if (closed || ws.readyState !== WebSocket.OPEN || authenticated) return;
            if (!result) { send(ws, { type: 'identity_required', reason: 'INVALID_CREDENTIAL', registrationCredential: randomBytes(32).toString('base64url') }); return; }
            runtime = result.runtime; world = runtime.world; authenticated = true; sandbox.connect(runtime); attached = true;
            const previous = playerSockets.get(result.record.playerId);
            playerSockets.set(result.record.playerId, ws); sessions.set(ws, { world, runtime });
            if (previous && previous !== ws) {
              const replace = () => previous.close(4001, 'Identity resumed in another tab'),
                delay = testMode ? options.replacementCloseDelayMs ?? 0 : 0;
              if (delay > 0) setTimeout(replace, delay);
              else replace();
            }
            send(ws, {
              type: 'identity_established', identity: sandbox.identity(result.record),
              credential: isRegistration ? (result as Awaited<ReturnType<SharedSandbox['register']>>).credential : undefined,
              restored: !isRegistration,
            });
            send(ws, { type: 'welcome', version: 1, shipId: world.state.ship.id, testMode });
          } catch (error) {
            const code = error instanceof IdentityConflict ? 'USERNAME_TAKEN'
              : identity.data.type === 'register_identity' && error instanceof RangeError
                ? 'USERNAME_INVALID'
                : error instanceof IdentityRestoreError
                  ? 'IDENTITY_RESTORE_INVALID'
                  : 'IDENTITY_UNAVAILABLE';
            send(ws, { type: 'identity_error', code });
            if (code === 'IDENTITY_UNAVAILABLE') ws.close(1013, 'Identity service temporarily unavailable');
          } finally {
            authInProgress = false;
          }
          return;
        }
        if (!currentSession()) {
          world.rejectedCommands++;
          send(ws, { type: 'error', code: 'SESSION_REPLACED' });
          return;
        }
        if (runtime?.busy) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'error', code: 'PERSISTENCE_BUSY' })); return; }
        const result = dispatch(world.state, incoming, world.state.profile.activeShipId);
        if (!result.ok) {
          world.rejectedCommands++;
          send(ws, { type: 'error', code: result.code });
          return;
        }
        durable = !!runtime && ['factionRequest', 'missionAcceptRequest', 'cargoDeliveryRequest', 'missionAbandonRequest',
          'recoveryRequest', 'shipSelectionRequest', 'fuelRequest', 'repairRequest', 'ammunitionRequest', 'upgradeRequest']
          .some(key => key in result);
        if (durable && runtime) { runtime.busy = true; pendingMessages.set(ws, []); }
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
          const plannedAtMs = Date.now(),
            shipSnapshot = structuredClone(world.state.ship),
            fingerprint = createManeuverPlanFingerprint(
              shipSnapshot,
              world.state.profile.activeShipId,
              target,
              plannedAtMs,
              targetEntityId,
              world.state.tick * CONFIG.fixedDt * 1000,
            ),
            plan = await planner.plan(shipSnapshot, target, plannerOwner);
          if (ws.readyState !== WebSocket.OPEN || !authenticated || !currentSession()) return;
          if (!plans.set(result.planRequest.requestId, { plan, targetEntityId, fingerprint }, plannedAtMs)) {
            send(ws, { type: 'error', code: 'PLAN_CAPACITY' });
            return;
          }
          send(ws, {
            type: 'maneuver_plan',
            requestId: result.planRequest.requestId,
            result: plan,
          });
        } else if ('executeRequest' in result && result.executeRequest !== undefined) {
          const executeAtMs = Date.now();
          if (plans.wasConsumed(result.executeRequest.planId, executeAtMs)) {
            send(ws, { type: 'error', code: 'DUPLICATE_EXECUTION' });
            return;
          }
          if (executingPlans.has(result.executeRequest.planId)) {
            send(ws, { type: 'error', code: 'MANEUVER_ACTIVE' });
            return;
          }
          const planRecord = plans.get(result.executeRequest.planId, executeAtMs);
          if (!planRecord) {
            send(ws, { type: 'error', code: 'UNKNOWN_PLAN' });
            return;
          }
          const currentTarget = planRecord.targetEntityId === world.state.station.id
              ? world.stationManeuverTarget(planRecord.targetEntityId)
              : planRecord.targetEntityId
                ? world.orbitalEntityManeuverTarget(planRecord.targetEntityId)
                : targetAtFingerprintEpoch(planRecord.fingerprint, world.state.tick * CONFIG.fixedDt * 1000);
          if (!currentTarget) {
            plans.delete(result.executeRequest.planId);
            send(ws, { type: 'error', code: 'REPLAN_REQUIRED' });
            return;
          }
          const valid = validateManeuverPlanFingerprint(
            planRecord.fingerprint,
            world.state.ship,
            world.state.profile.activeShipId,
            currentTarget,
            world.state.tick * CONFIG.fixedDt * 1000,
            executeAtMs,
          );
          if (!valid.ok) {
            plans.delete(result.executeRequest.planId);
            send(ws, { type: 'error', code: valid.code });
            return;
          }
          // Refresh the selected candidate at the execution epoch after the
          // bound assumptions pass. This rotates inertial burn vectors with the
          // naturally propagated ship/target without accepting manual changes.
          executingPlans.add(result.executeRequest.planId);
          const executionShip = structuredClone(world.state.ship),
            executionFingerprint = createManeuverPlanFingerprint(
              executionShip,
              world.state.profile.activeShipId,
              currentTarget,
              executeAtMs,
              planRecord.targetEntityId,
              world.state.tick * CONFIG.fixedDt * 1000,
            );
          let executionPlan: Awaited<ReturnType<PlannerService['plan']>>;
          try {
            executionPlan = await planner.plan(executionShip, currentTarget, plannerOwner);
          } finally {
            executingPlans.delete(result.executeRequest.planId);
          }
          const
            latestTarget = planRecord.targetEntityId === world.state.station.id
              ? world.stationManeuverTarget(planRecord.targetEntityId)
              : planRecord.targetEntityId
                ? world.orbitalEntityManeuverTarget(planRecord.targetEntityId)
                : targetAtFingerprintEpoch(executionFingerprint, world.state.tick * CONFIG.fixedDt * 1000),
            stillValid = latestTarget && validateManeuverPlanFingerprint(
              executionFingerprint,
              world.state.ship,
              world.state.profile.activeShipId,
              latestTarget,
              world.state.tick * CONFIG.fixedDt * 1000,
              Date.now(),
            ),
            candidate = executionPlan.candidates.find((item) => item.type === result.executeRequest.candidateType);
          if (!stillValid?.ok || !candidate) {
            plans.delete(result.executeRequest.planId);
            send(ws, { type: 'error', code: 'REPLAN_REQUIRED' });
            return;
          }
          const started = world.startManeuver(
            result.executeRequest.planId,
            candidate,
            world.state.combat.serverNowMs,
            planRecord?.targetEntityId,
          );
          if (!started.ok) {
            send(ws, { type: 'error', code: started.code });
            return;
          }
          plans.consume(result.executeRequest.planId, Date.now());
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
          const cargoPlan = await planner.plan(world.state.ship, MISSION_TARGETS.cargo, plannerOwner),
            reconnaissancePlan = await planner.plan(world.state.ship, MISSION_TARGETS.reconnaissance, plannerOwner),
            interceptionPlan = await planner.plan(world.state.ship, MISSION_TARGETS.interception, plannerOwner);
          const bountyTargets = world.state.combat.contacts.filter((item) => item.bountyClass && !item.destroyed),
            bountyPlanEntries: Array<readonly [string, Awaited<ReturnType<PlannerService['plan']>>]> = [];
          if (world.state.docking.phase === 'DOCKED') for (const item of bountyTargets)
            bountyPlanEntries.push([item.id, await planner.plan(world.state.ship, {
              kind: 'NEAR_RENDEZVOUS_STATE',
              state: { position: [...item.position], velocity: [...item.velocity] },
            }, plannerOwner)] as const);
          const
            bountyPlans = new Map(bountyPlanEntries);
          if (ws.readyState !== WebSocket.OPEN || !authenticated || !currentSession()) return;
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
      } catch (error) {
        world.rejectedCommands++;
        send(ws, { type: 'error', code: error instanceof PlannerServiceError ? error.code : 'INVALID_JSON' });
      } finally {
        if (durable && runtime) {
          const pending = pendingMessages.get(ws) ?? [];
          try {
            await sandbox.persist(runtime);
            pendingMessages.delete(ws);
            runtime.busy = false;
            for (const message of pending) send(ws, message);
          } catch {
            // Commit outcome may be ambiguous. Never overwrite it with an in-memory rollback.
            pendingMessages.delete(ws);
            sandbox.invalidate(runtime);
            send(ws, { type: 'error', code: 'PERSISTENCE_UNAVAILABLE' });
            ws.close(1013, 'Reconnect to restore durable state');
          }
        }
      }
    });
    ws.on('close', () => {
      closed = true;
      sessions.delete(ws);
      if (runtime && attached) {
        attached = false;
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
        if (session && !session.runtime?.busy && ws.bufferedAmount < 128 * 1024) send(ws, {
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
