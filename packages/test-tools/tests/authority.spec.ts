import { test, expect } from '@playwright/test';
import { WebSocket, type RawData } from 'ws';
import { TEST_SERVER, TEST_HEADERS } from '../src/runner';

type WireMessage = {
  type: string;
  code?: string;
  registrationCredential?: string;
  credential?: string;
  identity?: { playerId: string; shipId: string; callsign: string };
  state?: {
    lastInputSeq: number;
    ship: { id: string; mass: { propellantKg: number } };
  };
  serverNowMs?: number;
};

class WireProbe {
  readonly messages: WireMessage[] = [];
  constructor(readonly socket: WebSocket) {
    socket.on('message', (data) => this.messages.push(JSON.parse(data.toString()) as WireMessage));
  }
  async opened() {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise<void>((resolve, reject) => {
      this.socket.once('open', resolve);
      this.socket.once('error', reject);
    });
  }
  waitFor(predicate: (message: WireMessage) => boolean) {
    const existing = this.messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise<WireMessage>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.socket.off('message', onMessage);
        reject(new Error('Timed out waiting for authority message'));
      }, 5_000);
      const onMessage = (data: RawData) => {
        const message = JSON.parse(data.toString()) as WireMessage;
        if (!predicate(message)) return;
        clearTimeout(timeout);
        this.socket.off('message', onMessage);
        resolve(message);
      };
      this.socket.on('message', onMessage);
    });
  }
}

async function connect() {
  const probe = new WireProbe(new WebSocket('ws://127.0.0.1:8788/socket'));
  await probe.opened();
  return probe;
}

async function register(probe: WireProbe, prefix: string) {
  const required = await probe.waitFor((message) => message.type === 'identity_required'),
    credential = required.registrationCredential!,
    suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
  probe.socket.send(JSON.stringify({
    type: 'register_identity', version: 1, requestId: `register-${suffix}`,
    username: `${prefix}_${suffix}`.slice(0, 20), credential,
  }));
  const established = await probe.waitFor((message) => message.type === 'identity_established');
  return { credential: established.credential ?? credential, identity: established.identity! };
}

async function resume(probe: WireProbe, credential: string) {
  await probe.waitFor((message) => message.type === 'identity_required');
  probe.socket.send(JSON.stringify({ type: 'resume_identity', version: 1, credential }));
  return probe.waitFor((message) => message.type === 'identity_established');
}

test('test controls require a separate credential', async ({ request }) => {
  expect((await request.get(`${TEST_SERVER}/__test/state`)).status()).toBe(404);
  expect((await request.get(`${TEST_SERVER}/__test/state`, { headers: TEST_HEADERS })).status()).toBe(200);
});

test('authenticated wire strictly rejects forged fields and foreign ownership', async () => {
  const probe = await connect(), { identity } = await register(probe, 'WIRE');
  const base = {
    type: 'input', version: 1, shipId: identity.shipId, seq: 1,
    translation: [0, 0, -1], rotation: [0, 0, 0],
  };
  probe.socket.send(JSON.stringify({ ...base, position: [0, 0, 0] }));
  probe.socket.send(JSON.stringify({ ...base, shipId: 'foreign-ship-id' }));
  await expect.poll(() => probe.messages.filter((message) => message.type === 'error').length).toBe(2);
  expect(probe.messages.filter((message) => message.type === 'error').map((message) => message.code))
    .toEqual(['INVALID_COMMAND', 'NOT_OWNER']);
  const snapshot = await probe.waitFor((message) => message.type === 'snapshot');
  expect(snapshot.state?.lastInputSeq).toBe(-1);
  probe.socket.close();
});

test('replacement closes the old session and rejects its delayed authority', async () => {
  const first = await connect(), registered = await register(first, 'REPLACE'),
    second = await connect(), firstClosed = new Promise<number>((resolve) => first.socket.once('close', resolve));
  await resume(second, registered.credential);
  const before = await second.waitFor((message) => message.type === 'snapshot'),
    beforeServerNow = before.serverNowMs ?? 0,
    beforeFuel = before.state!.ship.mass.propellantKg;
  expect(first.socket.readyState).toBe(WebSocket.OPEN);
  first.socket.send(JSON.stringify({
    type: 'input', version: 1, shipId: registered.identity.shipId, seq: 777,
    translation: [0, 0, -1], rotation: [0, 0, 0],
  }));
  await first.waitFor((message) => message.type === 'error' && message.code === 'SESSION_REPLACED');
  const after = await second.waitFor(
    (message) => message.type === 'snapshot' && (message.serverNowMs ?? 0) > beforeServerNow,
  );
  expect(after.state?.lastInputSeq).toBe(-1);
  expect(after.state?.ship.mass.propellantKg).toBe(beforeFuel);
  expect(await firstClosed).toBe(4001);

  second.socket.send(JSON.stringify({
    type: 'input', version: 1, shipId: registered.identity.shipId, seq: 9,
    translation: [0, 0, -1], rotation: [0, 0, 0],
  }));
  await expect.poll(() => second.messages.filter((message) => message.type === 'snapshot').at(-1)?.state?.lastInputSeq)
    .toBe(9);
  second.socket.close();
});
