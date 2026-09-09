import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import type { IdentityRecord, IdentityRepository } from '../identity/identity-repository';
import { SharedSandbox, type SharedPilotRuntime } from '../shared-sandbox';
import { attachGateway } from './gateway';

const credential = 'gateway-credential-'.padEnd(43, 'x');
const record: IdentityRecord = {
  playerId: 'player-gateway-01',
  username: 'GATEWAY_01',
  normalizedUsername: 'gateway_01',
  credentialHash: 'hash',
  shipId: 'ship-gateway-01',
  spawnSlot: 0,
};

class StubIdentityRepository implements IdentityRepository {
  authenticate = vi.fn(async () => structuredClone(record));
  saveShip = vi.fn(async () => {});
  async register() { return { record: structuredClone(record), credential }; }
  async health() {}
}

interface Probe {
  ws: WebSocket;
  messages: Array<Record<string, unknown>>;
  waitFor(predicate: (message: Record<string, unknown>) => boolean): Promise<Record<string, unknown>>;
}

async function openProbe(url: string): Promise<Probe> {
  const ws = new WebSocket(url), messages: Array<Record<string, unknown>> = [];
  ws.on('message', (data) => messages.push(JSON.parse(data.toString()) as Record<string, unknown>));
  await new Promise<void>((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return {
    ws,
    messages,
    waitFor(predicate) {
      const existing = messages.find(predicate);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          ws.off('message', onMessage);
          reject(new Error('Timed out waiting for WebSocket message'));
        }, 2_000);
        const onMessage = (data: WebSocket.RawData) => {
          const message = JSON.parse(data.toString()) as Record<string, unknown>;
          if (!predicate(message)) return;
          clearTimeout(timeout);
          ws.off('message', onMessage);
          resolve(message);
        };
        ws.on('message', onMessage);
      });
    },
  };
}

describe('authenticated gateway session safety', () => {
  const servers: Server[] = [];
  const gateways: Array<ReturnType<typeof attachGateway>> = [];
  const sockets: WebSocket[] = [];

  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.terminate();
    for (const gateway of gateways.splice(0)) gateway.close();
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  });

  async function setup(repository: IdentityRepository, replacementCloseDelayMs = 0) {
    const sandbox = new SharedSandbox(repository), server = createServer(),
      gateway = attachGateway(server, sandbox, true, { replacementCloseDelayMs });
    servers.push(server); gateways.push(gateway);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    return { sandbox, gateway, url: `ws://127.0.0.1:${port}/socket` };
  }

  async function resume(url: string) {
    const probe = await openProbe(url);
    sockets.push(probe.ws);
    await probe.waitFor((message) => message.type === 'identity_required');
    probe.ws.send(JSON.stringify({ type: 'resume_identity', version: 1, credential }));
    await probe.waitFor((message) => message.type === 'identity_established');
    return probe;
  }

  it('CAN-013/019: acknowledges a purchase only after persistence and fails closed on an uncertain commit', async () => {
    const repository = new StubIdentityRepository(), { sandbox, gateway, url } = await setup(repository), probe = await resume(url);
    const runtime = (await sandbox.resume(credential))!.runtime, world = runtime.world;
    world.state.docking.phase = 'DOCKED'; world.state.docking.selectedStationId = world.state.station.id;
    let rejectSave!: (error: Error) => void;
    repository.saveShip.mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectSave = reject; }));
    probe.ws.send(JSON.stringify({ type: 'buy_fuel', version: 1, shipId: world.state.ship.id,
      stationId: world.state.station.id, amountKg: 1, transactionId: 'durable-fuel' }));
    await vi.waitFor(() => expect(runtime.busy).toBe(true));
    gateway.broadcast(0);
    expect(probe.messages.some(message => message.type === 'economy_ack')).toBe(false);
    expect(probe.messages.some(message => message.type === 'snapshot')).toBe(false);
    rejectSave(new Error('uncertain commit'));
    await probe.waitFor(message => message.code === 'PERSISTENCE_UNAVAILABLE');
    await vi.waitFor(() => expect(sandbox.runtimeCount()).toBe(0));
    expect(probe.messages.some(message => message.type === 'economy_ack')).toBe(false);
    await resume(url);
    const fresh = (await sandbox.resume(credential))!.runtime;
    expect(fresh).not.toBe(runtime); expect(fresh.world.state.ship.id).toBe(record.shipId);
  });

  it('CAN-021: a socket gets at most three registration attempts; reconnect does not reset the peer budget', async () => {
    const repository = new StubIdentityRepository();
    repository.register = vi.fn(async () => { throw new RangeError('USERNAME_INVALID'); });
    const { url } = await setup(repository);
    for (let socketIndex = 0; socketIndex < 4; socketIndex++) {
      const probe = await openProbe(url); sockets.push(probe.ws);
      await probe.waitFor(message => message.type === 'identity_required');
      for (let attempt = 0; attempt < 4 && probe.ws.readyState === WebSocket.OPEN; attempt++) {
        const count = probe.messages.length;
        probe.ws.send(JSON.stringify({ type: 'register_identity', version: 1, requestId: `register-${socketIndex}-${attempt}`, username: 'VALID_NAME', credential }));
        await vi.waitFor(() => expect(probe.messages.length).toBeGreaterThan(count));
        if (probe.messages.some(message => message.code === 'REGISTRATION_RATE_LIMIT')) break;
        await new Promise<void>(resolve => setImmediate(resolve));
      }
      expect(probe.messages.some(message => message.code === 'REGISTRATION_RATE_LIMIT'), JSON.stringify(probe.messages)).toBe(true);
    }
    expect(repository.register).toHaveBeenCalledTimes(10);
  });

  it('revokes the replaced socket synchronously before its close handshake', async () => {
    const repository = new StubIdentityRepository(), { sandbox, url } = await setup(repository, 500),
      first = await resume(url), second = await resume(url),
      runtime = (await sandbox.resume(credential))!.runtime,
      fuelBefore = runtime.world.state.ship.mass.propellantKg;
    expect(first.ws.readyState).toBe(WebSocket.OPEN);
    first.ws.send(JSON.stringify({
      type: 'input', version: 1, shipId: record.shipId, seq: 77,
      translation: [0, 0, -1], rotation: [0, 0, 0],
    }));
    await first.waitFor((message) => message.type === 'error' && message.code === 'SESSION_REPLACED');
    expect(runtime.world.state.lastInputSeq).toBe(-1);
    expect(runtime.world.state.ship.mass.propellantKg).toBe(fuelBefore);
    expect(runtime.world.state.controls.translation).toEqual([0, 0, 0]);
    second.ws.close();
  });

  it('rejects a stale executable plan with REPLAN_REQUIRED before consuming fuel', async () => {
    const repository = new StubIdentityRepository(), { sandbox, url } = await setup(repository), probe = await resume(url),
      runtime = (await sandbox.resume(credential))!.runtime, world = runtime.world,
      planId = 'stale-station-plan';
    probe.ws.send(JSON.stringify({
      type: 'plan_maneuver', version: 1, shipId: world.state.ship.id, requestId: planId,
      target: { kind: 'STATION_RENDEZVOUS', stationId: world.state.station.id },
    }));
    const response = await probe.waitFor(message => message.type === 'maneuver_plan' && message.requestId === planId),
      result = response.result as { candidates: Array<{ type: 'ECONOMIC' | 'BALANCED' | 'FAST' }> };
    expect(result.candidates.length).toBeGreaterThan(0);
    world.state.ship.position[0] += 860_000;
    const fuel = world.state.ship.mass.propellantKg;
    probe.ws.send(JSON.stringify({
      type: 'execute_maneuver', version: 1, shipId: world.state.ship.id,
      planId, candidateType: result.candidates[0].type,
    }));
    await probe.waitFor(message => message.type === 'error' && message.code === 'REPLAN_REQUIRED');
    expect(world.state.ship.mass.propellantKg).toBe(fuel);
    expect(world.state.maneuver).toBeUndefined();
  });

  it('serializes concurrent auth and detaches exactly one presence on close', async () => {
    let release!: (value: IdentityRecord) => void;
    const repository = new StubIdentityRepository(),
      pending = new Promise<IdentityRecord>((resolve) => { release = resolve; });
    repository.authenticate.mockImplementationOnce(() => pending);
    const { sandbox, url } = await setup(repository), connect = vi.spyOn(sandbox, 'connect'),
      probe = await openProbe(url);
    sockets.push(probe.ws);
    await probe.waitFor((message) => message.type === 'identity_required');
    const resumeMessage = JSON.stringify({ type: 'resume_identity', version: 1, credential });
    probe.ws.send(resumeMessage); probe.ws.send(resumeMessage);
    await vi.waitFor(() => expect(repository.authenticate).toHaveBeenCalledTimes(1));
    release(structuredClone(record));
    await probe.waitFor((message) => message.type === 'identity_established');
    expect(connect).toHaveBeenCalledTimes(1);
    const runtime = connect.mock.calls[0][0] as SharedPilotRuntime;
    expect(runtime.connections).toBe(1);
    probe.ws.close();
    await new Promise<void>((resolve) => probe.ws.once('close', () => resolve()));
    await vi.waitFor(() => expect(runtime.connections).toBe(0));
    expect(runtime.presence).toBe('OFFLINE');
  });

  it('reports repository failure as retryable and later resumes the same identity', async () => {
    const repository = new StubIdentityRepository();
    repository.authenticate.mockRejectedValueOnce(new Error('database temporarily unavailable'));
    const { url } = await setup(repository), first = await openProbe(url);
    sockets.push(first.ws);
    await first.waitFor((message) => message.type === 'identity_required');
    first.ws.send(JSON.stringify({ type: 'resume_identity', version: 1, credential }));
    await first.waitFor((message) => message.type === 'identity_error' && message.code === 'IDENTITY_UNAVAILABLE');
    await new Promise<void>((resolve) => first.ws.once('close', () => resolve()));
    const second = await resume(url);
    expect((second.messages.find((message) => message.type === 'identity_established')?.identity as IdentityRecord).playerId)
      .toBe(record.playerId);
    second.ws.close();
  });
});
