import type { IncomingMessage, ServerResponse } from 'node:http';
import { scenarioResetSchema } from '@orbital/shared';
import type { World } from '../world';
export async function testEndpoint(
  req: IncomingMessage,
  res: ServerResponse,
  world: World,
  testToken: string | undefined,
) {
  if (!req.url?.startsWith('/__test/')) return false;
  if (!testToken || req.headers['x-test-token'] !== testToken) {
    res.writeHead(404);
    res.end();
    return true;
  }
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'GET' && req.url === '/__test/state') {
    res.end(JSON.stringify(world.state));
    return true;
  }
  if (req.method === 'POST' && req.url === '/__test/reset') {
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
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'INVALID_SCENARIO' }));
    }
    return true;
  }
  res.writeHead(404);
  res.end();
  return true;
}
