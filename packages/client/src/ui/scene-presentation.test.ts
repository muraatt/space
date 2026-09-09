import { describe, expect, it } from 'vitest';
import { scenePresentation } from './scene-presentation';

describe('CAN-027 authoritative scene presentation', () => {
  it('hides ineffective scene controls and presents the shared authority scene', () => {
    expect(scenePresentation('orbit_night', 'bounty_sandbox', true)).toMatchObject({
      scene: 'bounty_sandbox',
      title: 'Paylaşılan görev alanı',
      canSelectScene: false,
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
