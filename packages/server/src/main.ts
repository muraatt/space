import { createServer } from 'node:http';
import { CONFIG } from '@orbital/shared';
import { World } from './world';
import { attachGateway } from './net/gateway';
import { testEndpoint } from './debug/test-endpoints';
const host = process.env.HOST ?? '127.0.0.1';
if (host !== '127.0.0.1' && host !== 'localhost')
  throw new Error('Local development server is loopback only.');
const testToken = process.env.TEST_MODE === '1' ? process.env.TEST_TOKEN : undefined;
if (process.env.TEST_MODE === '1' && !testToken) throw new Error('Test server requires TEST_TOKEN');
const world = new World();
const server = createServer(async (req, res) => {
  if (await testEndpoint(req, res, world, testToken)) return;
  if (req.url === '/health') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: 'ok', session: 3, persistence: 'memory', testMode: !!testToken }));
    return;
  }
  res.writeHead(404);
  res.end();
});
const gateway = attachGateway(server, world, !!testToken);
let prev = performance.now(),
  acc = 0,
  lastBroadcast = 0;
const timer = setInterval(() => {
  const now = performance.now();
  acc += (now - prev) / 1000;
  prev = now;
  let steps = 0;
  while (acc >= CONFIG.fixedDt && steps < 30) {
    world.tick(now);
    acc -= CONFIG.fixedDt;
    steps++;
  }
  if (now - lastBroadcast >= 1000 / CONFIG.snapshotHz) {
    gateway.broadcast(acc * 1000);
    lastBroadcast = now;
  }
}, 4);
const port = Number(process.env.PORT ?? CONFIG.port);
server.listen(port, host, () =>
  console.log(`ORBITAL authority http://${host}:${port} (memory; test=${!!testToken})`),
);
function close() {
  clearInterval(timer);
  gateway.close();
  server.close(() => process.exit(0));
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
