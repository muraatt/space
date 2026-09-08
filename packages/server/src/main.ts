import { createServer } from 'node:http';
import { CONFIG } from '@orbital/shared';
import { attachGateway } from './net/gateway';
import { testEndpoint } from './debug/test-endpoints';
import { resolve } from 'node:path';
import { FileIdentityRepository } from './identity/file-identity-repository';
import { PostgresIdentityRepository } from './identity/postgres-identity-repository';
import { SharedSandbox } from './shared-sandbox';
const host = process.env.HOST ?? '127.0.0.1';
const testToken = process.env.TEST_MODE === '1' ? process.env.TEST_TOKEN : undefined;
if (process.env.TEST_MODE === '1' && !testToken) throw new Error('Test server requires TEST_TOKEN');
const identityPath = resolve(process.env.IDENTITY_STORE_PATH ?? '.data/identities.json');
const databaseUrl = process.env.DATABASE_URL?.trim();
const identities = databaseUrl
  ? await PostgresIdentityRepository.connect(databaseUrl)
  : new FileIdentityRepository(identityPath);
const persistence = databaseUrl ? 'postgres-identity' : 'file-identity';
const sandbox = new SharedSandbox(identities);
const world = sandbox.legacyWorld;
const server = createServer(async (req, res) => {
  if (await testEndpoint(req, res, world, testToken)) return;
  if (req.url === '/health') {
    res.setHeader('Content-Type', 'application/json');
    try {
      await identities.health();
      res.end(
        JSON.stringify({ status: 'ok', phase: 'shared-sandbox-0', persistence, testMode: !!testToken }),
      );
    } catch {
      res.statusCode = 503;
      res.end(JSON.stringify({ status: 'unavailable', phase: 'shared-sandbox-0', persistence }));
    }
    return;
  }
  res.writeHead(404);
  res.end();
});
const gateway = attachGateway(server, sandbox, !!testToken);
let prev = performance.now(),
  acc = 0,
  lastBroadcast = 0;
const timer = setInterval(() => {
  const now = performance.now();
  acc += (now - prev) / 1000;
  prev = now;
  let steps = 0;
  while (acc >= CONFIG.fixedDt && steps < 30) {
    sandbox.tick(now);
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
  console.log(`ORBITAL authority http://${host}:${port} (${persistence}; test=${!!testToken})`),
);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  clearInterval(timer);
  gateway.close();
  const forceExit = setTimeout(() => process.exit(0), 2_000);
  await sandbox.flush();
  server.close(() => {
    clearTimeout(forceExit);
    process.exit(0);
  });
  server.closeAllConnections();
}
if (!testToken) {
  process.on('SIGINT', () => void close());
  process.on('SIGTERM', () => void close());
}
