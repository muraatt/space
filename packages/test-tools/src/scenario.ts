import type { SceneId } from '@orbital/shared';
export interface Scenario {
  id: SceneId;
  seed: number;
  paused: boolean;
  expectedAltitude: number;
}
