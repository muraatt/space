import type { IncomingMessage, ServerResponse } from 'node:http';
import { CONFIG, scenarioResetSchema } from '@orbital/shared';
import type { World } from '../world';
import type { SharedSandbox } from '../shared-sandbox';
export async function testEndpoint(
  req: IncomingMessage,
  res: ServerResponse,
  world: World,
  testToken: string | undefined,
  sandbox?: SharedSandbox,
) {
  if (!req.url?.startsWith('/__test/')) return false;
  if (!testToken || req.headers['x-test-token'] !== testToken) {
    res.writeHead(404);
    res.end();
    return true;
  }
  res.setHeader('Content-Type', 'application/json');
  const url = new URL(req.url, 'http://127.0.0.1'),
    playerId = url.searchParams.get('playerId'),
    targetWorld = playerId ? sandbox?.worldForTest(playerId) : world;
  if (playerId && !targetWorld) {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'UNKNOWN_TEST_PLAYER' }));
    return true;
  }
  if (req.method === 'GET' && url.pathname === '/__test/state') {
    res.end(JSON.stringify(targetWorld!.state));
    return true;
  }
  if (req.method === 'POST' && url.pathname === '/__test/reset') {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 2048) {
        res.writeHead(413);
        res.end();
        return true;
      }
    }
    try {
      const data = scenarioResetSchema.parse(JSON.parse(body));
      world.reset(data.scene, data.paused, data.seed);
      // Isolated starting fixture for the existing reconnaissance objective;
      // acceptance, scanning and rewards still use the normal command path.
      if (data.startOrbitAltitudeKm) {
        const radius = CONFIG.earthRadius + data.startOrbitAltitudeKm * 1000;
        world.state.ship.position = [radius, 0, 0];
        world.state.ship.velocity = [0, 0, -Math.sqrt(CONFIG.earthMu / radius)];
      }
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'INVALID_SCENARIO' }));
    }
    return true;
  }
  if (req.method === 'POST' && url.pathname === '/__test/advance-maneuver') {
    const nextEventAtMs = targetWorld!.state.maneuver?.nextEventAtMs;
    if (!nextEventAtMs || targetWorld!.state.maneuver?.status !== 'COASTING') {
      res.writeHead(409);
      res.end(JSON.stringify({ error: 'NO_COAST_EVENT' }));
      return true;
    }
    const advancedToMs = playerId
      ? sandbox!.advanceManeuverForTest(playerId)!
      : (targetWorld!.tick(performance.now(), nextEventAtMs + 1), nextEventAtMs + 1);
    res.end(JSON.stringify({ ok: true, advancedToMs }));
    return true;
  }
  if (req.method === 'POST' && url.pathname === '/__test/player-damage') {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 512) {
        res.writeHead(413);
        res.end();
        return true;
      }
    }
    try {
      const data = JSON.parse(body) as { damageId?: unknown; amount?: unknown };
      if (typeof data.damageId !== 'string' || data.damageId.length > 100 || typeof data.amount !== 'number')
        throw new Error('invalid fixture');
      const result = targetWorld!.receivePlayerDamage(data.damageId, data.amount, Date.now());
      res.writeHead(result.ok ? 200 : 409);
      res.end(JSON.stringify(result));
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'INVALID_DAMAGE_FIXTURE' }));
    }
    return true;
  }
  if (req.method === 'POST' && url.pathname === '/__test/prepare-capture') {
    if (!playerId || !sandbox?.prepareCaptureForTest(playerId)) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'UNKNOWN_TEST_PLAYER' }));
    } else res.end(JSON.stringify({ ok: true }));
    return true;
  }
  res.writeHead(404);
  res.end();
  return true;
}
