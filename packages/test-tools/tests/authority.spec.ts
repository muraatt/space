import { test, expect } from '@playwright/test';
import { WebSocket } from 'ws';
import { TEST_SERVER, TEST_HEADERS, reset } from '../src/runner';
import { orbitDay } from '../src/scenarios/orbit_day';
test('test controls require a separate credential', async ({ request }) => {
  expect((await request.get(`${TEST_SERVER}/__test/state`)).status()).toBe(404);
  expect((await request.get(`${TEST_SERVER}/__test/state`, { headers: TEST_HEADERS })).status()).toBe(200);
});
test('wire rejects forged authoritative fields and foreign ownership', async ({ request }) => {
  await reset(request, orbitDay);
  const ws = new WebSocket('ws://127.0.0.1:8788/socket');
  const messages: { type: string; code?: string }[] = [];
  ws.on('message', (d) => messages.push(JSON.parse(d.toString())));
  await new Promise<void>((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  const base = {
    type: 'input',
    version: 1,
    shipId: 'kestrel-01',
    seq: 1,
    translation: [0, 0, -1],
    rotation: [0, 0, 0],
  };
  ws.send(JSON.stringify({ ...base, position: [0, 0, 0] }));
  ws.send(JSON.stringify({ ...base, shipId: 'foreign' }));
  await expect.poll(() => messages.filter((m) => m.type === 'error').length).toBe(2);
  expect(messages.filter((m) => m.type === 'error').map((m) => m.code)).toEqual([
    'INVALID_COMMAND',
    'NOT_OWNER',
  ]);
  const state = await (await request.get(`${TEST_SERVER}/__test/state`, { headers: TEST_HEADERS })).json();
  expect(state.lastInputSeq).toBe(-1);
  ws.close();
  await new Promise<void>((r) => ws.once('close', () => r()));
});

test('local pilot handover releases the old tab and preserves the authority boundary', async ({
  request,
}) => {
  await reset(request, orbitDay);
  const first = new WebSocket('ws://127.0.0.1:8788/socket');
  await new Promise<void>((resolve, reject) => {
    first.once('open', resolve);
    first.once('error', reject);
  });
  const closed = new Promise<number>((resolve) => first.once('close', resolve));
  const second = new WebSocket('ws://127.0.0.1:8788/socket');
  await new Promise<void>((resolve, reject) => {
    second.once('open', resolve);
    second.once('error', reject);
  });
  expect(await closed).toBe(4001);
  second.send(
    JSON.stringify({
      type: 'input',
      version: 1,
      shipId: 'kestrel-01',
      seq: 9,
      translation: [0, 0, -1],
      rotation: [0, 0, 0],
    }),
  );
  await expect
    .poll(async () => {
      const r = await request.get(`${TEST_SERVER}/__test/state`, { headers: TEST_HEADERS });
      return (await r.json()).lastInputSeq;
    })
    .toBe(9);
  second.close();
  await new Promise<void>((r) => second.once('close', () => r()));
});
