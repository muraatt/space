import { describe, expect, it } from 'vitest';
import { scenePresentation } from './scene-presentation';

describe('CAN-027 authoritative scene presentation', () => {
  it('presents the shared authority scene with effective shared lighting controls', () => {
    expect(scenePresentation('orbit_night', 'bounty_sandbox', true)).toMatchObject({
      scene: 'bounty_sandbox',
      title: 'Paylaşılan görev alanı',
      canSelectScene: true,
      sharedLighting: true,
    });
  });

  it('keeps day/night selection in the isolated legacy test world', () => {
    expect(scenePresentation('orbit_night', undefined, false)).toMatchObject({
      scene: 'orbit_night',
      title: 'Gece vardiyası',
      canSelectScene: true,
    });
  });
});
