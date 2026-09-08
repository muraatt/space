import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialWorld } from '@orbital/simulation';
import type { Snapshot } from '@orbital/shared';
import { Connection } from './connection';

class FakeSocket {
  static OPEN = 1;
  readyState = 1;
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose?: (event: { code: number }) => void;
  onerror?: () => void;
  send = vi.fn();
  close = vi.fn();
  constructor(public url: string) {}
  receive(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
}

describe('client command availability', () => {
  let connection: Connection;
  let socket: FakeSocket;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeSocket);
    vi.stubGlobal('location', { protocol: 'http:', host: '127.0.0.1:5174' });
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
});
