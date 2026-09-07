import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import { CONFIG, SCENES, neutralControls, type ServerMessage, type SceneId } from '@orbital/shared';
import type { World } from '../world';
import { dispatch } from '../commands/dispatch';
import { PlannerService } from '../planner/service';
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
      if (!world.paused && SCENES.includes(scene as SceneId)) world.reset(scene as SceneId);
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
        const result = dispatch(world.state, JSON.parse(raw.toString()), CONFIG.shipId);
        if (!result.ok) {
          world.rejectedCommands++;
          send(ws, { type: 'error', code: result.code });
          return;
        }
        if ('pong' in result && result.pong !== undefined) send(ws, { type: 'pong', sentAt: result.pong });
        else if ('planRequest' in result && result.planRequest !== undefined) {
          const plan = await planner.plan(world.state.ship, result.planRequest.target);
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
