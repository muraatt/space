import type { WorldState } from '@orbital/shared';
import type { GameRenderer } from '../render/renderer';
import type { Connection } from '../net/connection';
export interface OrbitalDebug {
  getState(): WorldState | undefined;
  getMetrics(): ReturnType<GameRenderer['metrics']> & {
    rttMs: number;
    bytesIn: number;
    bytesOut: number;
    server: Connection['snapshot'] extends infer T ? (T extends { metrics: infer M } ? M : undefined) : never;
  };
  getCamera(): ReturnType<GameRenderer['camera']['state']>;
  getFrameTimes(): number[];
}
declare global {
  interface Window {
    __ORBITAL__?: OrbitalDebug;
  }
}
export function installTestBridge(renderer: GameRenderer, connection: Connection) {
  const bridge = {
    getState: () => (connection.snapshot ? structuredClone(connection.snapshot.state) : undefined),
    getMetrics: () => ({
      ...renderer.metrics(),
      rttMs: connection.rttMs,
      bytesIn: connection.bytesIn,
      bytesOut: connection.bytesOut,
      server: connection.snapshot?.metrics,
    }),
    getCamera: () => renderer.camera.state(),
    getFrameTimes: () => [...renderer.frameTimes],
  };
  Object.defineProperty(window, '__ORBITAL__', {
    value: Object.freeze(bridge),
    configurable: true,
    writable: false,
  });
  return () => {
    delete window.__ORBITAL__;
  };
}
