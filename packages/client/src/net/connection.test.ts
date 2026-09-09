import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialWorld } from '@orbital/simulation';
import type { Snapshot } from '@orbital/shared';
import { Connection } from './connection';

class FakeSocket {
  static OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 1;
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose?: (event: { code: number }) => void;
  onerror?: () => void;
  send = vi.fn();
  close = vi.fn();
  constructor(public url: string) { FakeSocket.instances.push(this); }
  receive(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
}

describe('client command availability', () => {
  let connection: Connection;
  let socket: FakeSocket;
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeSocket);
    vi.stubGlobal('location', { protocol: 'http:', host: '127.0.0.1:5174', port: '5174', search: '' });
    connection = new Connection();
    connection.connect('orbit_day');
    socket = connection.socket as unknown as FakeSocket;
    socket.onopen?.();
    socket.receive({ type: 'snapshot', state: initialWorld() });
  });
  afterEach(() => { connection.dispose(); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('rejected execute releases manual controls; authoritative active phase still blocks them', () => {
    expect(connection.flightInputAllowed()).toBe(true);
    connection.execute('ECONOMIC');
    expect(connection.flightInputAllowed()).toBe(false);
    socket.receive({ type: 'error', code: 'UNKNOWN_PLAN' });
    expect(connection.flightInputAllowed()).toBe(true);
    const state = initialWorld();
    state.maneuver = { status: 'COASTING' } as NonNullable<Snapshot['state']['maneuver']>;
    socket.receive({ type: 'snapshot', state });
    socket.receive({ type: 'error', code: 'DUPLICATE_EXECUTION' });
    expect(connection.flightInputAllowed()).toBe(false);
    state.maneuver.status = 'CANCELLED';
    socket.receive({ type: 'snapshot', state });
    expect(connection.flightInputAllowed()).toBe(true);
  });

  it('offline commands fail visibly without permanent pending indicators', () => {
    socket.readyState = 3;
    socket.onclose?.({ code: 1006 });
    connection.requestMissions();
    connection.requestPlan({ kind: 'CIRCULAR_ORBIT', radiusM: 7171000, phaseAheadRad: 0.1 });
    connection.execute('ECONOMIC');
    expect(connection.lastError).toBe('NOT_CONNECTED');
    expect(connection.missionPending || connection.planPending || connection.maneuverCommandActive).toBe(false);
    expect(connection.flightInputAllowed()).toBe(false);
    expect(connection.snapshot).toBeUndefined();
  });

  it('reclaim preserves the world and ignores delayed events from the old socket', () => {
    connection.connect('orbit_day', true);
    const replacement = connection.socket as unknown as FakeSocket;
    expect(replacement.url).toContain('resume=1');
    expect(connection.flightInputAllowed()).toBe(false);
    replacement.onopen?.();
    replacement.receive({ type: 'snapshot', state: initialWorld() });
    socket.onclose?.({ code: 4001 });
    socket.receive({ type: 'error', code: 'UNKNOWN_PLAN' });
    expect(connection.status).toBe('Bağlı');
    expect(connection.lastError).toBe('');
    expect(connection.flightInputAllowed()).toBe(true);
  });

  it('destroyed ship cannot send flight input until authoritative recovery', () => {
    const state = initialWorld();
    state.combat.playerDestroyed = true;
    socket.receive({ type: 'snapshot', state });
    expect(connection.flightInputAllowed()).toBe(false);
    state.combat.playerDestroyed = false;
    socket.receive({ type: 'snapshot', state });
    expect(connection.flightInputAllowed()).toBe(true);
  });

  it('CAN-003: replacement snapshots update the public identity and command ownership together', () => {
    connection.identity = { playerId: 'pilot', callsign: 'LOCKED', shipId: 'old-ship' };
    const state = initialWorld(); state.ship.id = 'ship-replacement'; state.profile.activeShipId = state.ship.id;
    socket.receive({ type: 'snapshot', state });
    expect(connection.identity).toEqual({ playerId: 'pilot', callsign: 'LOCKED', shipId: state.ship.id });
    connection.input({ translation: [0, 0, 0], rotation: [0, 0, 0] });
    expect(JSON.parse(socket.send.mock.calls.at(-1)![0])).toMatchObject({ type: 'input', shipId: state.ship.id });
  });

  it('preserves the credential on transient identity failure and retries resume', () => {
    connection.dispose();
    const values = new Map<string, string>(), credential = 'c'.repeat(43);
    values.set('orbital.identity.credential.v1', credential);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    vi.stubGlobal('location', {
      protocol: 'http:', host: '127.0.0.1:5174', port: '5174', search: '?shared=1',
    });
    connection = new Connection();
    connection.connect('bounty_sandbox');
    socket = connection.socket as unknown as FakeSocket;
    socket.onopen?.();
    socket.receive({
      type: 'identity_required', reason: 'MISSING_CREDENTIAL', registrationCredential: 'r'.repeat(43),
    });
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({
      type: 'resume_identity', version: 1, credential,
    }));
    socket.receive({ type: 'identity_error', code: 'IDENTITY_UNAVAILABLE' });
    expect(values.get('orbital.identity.credential.v1')).toBe(credential);
    expect(connection.status).toContain('geçici');
    socket.onclose?.({ code: 1013 });
    expect(connection.status).toContain('yeniden deneniyor');
    vi.advanceTimersByTime(1_000);
    const retry = FakeSocket.instances.at(-1)!;
    expect(retry).not.toBe(socket);
    retry.onopen?.();
    retry.receive({
      type: 'identity_required', reason: 'MISSING_CREDENTIAL', registrationCredential: 'n'.repeat(43),
    });
    expect(retry.send).toHaveBeenCalledWith(JSON.stringify({
      type: 'resume_identity', version: 1, credential,
    }));
    retry.receive({
      type: 'identity_required', reason: 'INVALID_CREDENTIAL', registrationCredential: 'z'.repeat(43),
    });
    expect(values.has('orbital.identity.credential.v1')).toBe(false);
  });

  it('surfaces an isolated restore error without deleting the valid credential', () => {
    connection.dispose();
    const values = new Map<string, string>(), credential = 'd'.repeat(43);
    values.set('orbital.identity.credential.v1', credential);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    vi.stubGlobal('location', {
      protocol: 'http:', host: '127.0.0.1:5174', port: '5174', search: '?shared=1',
    });
    connection = new Connection();
    connection.connect('bounty_sandbox');
    socket = connection.socket as unknown as FakeSocket;
    socket.onopen?.();
    socket.receive({ type: 'identity_error', code: 'IDENTITY_RESTORE_INVALID' });
    expect(connection.status).toBe('Kayıtlı gemi geri yüklenemedi');
    expect(connection.lastError).toBe('IDENTITY_RESTORE_INVALID');
    expect(values.get('orbital.identity.credential.v1')).toBe(credential);
  });
});
