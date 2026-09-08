import { CanvasTexture, Group, Quaternion, Sprite, SpriteMaterial, SRGBColorSpace } from 'three/webgpu';
import type { RemotePlayerState } from '@orbital/shared';
import { makeShip } from './ship';
import type { renderFrame } from './render-frame';

type Frame = ReturnType<typeof renderFrame>;
type Visual = ReturnType<typeof makeShip> & { root: Group; label: Sprite };

function makeLabel(callsign: string) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
  const context = canvas.getContext('2d')!;
  context.fillStyle = 'rgba(3,15,22,.82)'; context.fillRect(0, 0, 512, 96);
  context.strokeStyle = '#6fe0f4'; context.lineWidth = 4; context.strokeRect(3, 3, 506, 90);
  context.fillStyle = '#e9fbff'; context.font = 'bold 36px Consolas'; context.textAlign = 'center';
  context.fillText(callsign.toUpperCase(), 256, 60);
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(18, 3.4, 1); sprite.position.set(0, 9, 0); sprite.renderOrder = 20;
  return sprite;
}

export class RemotePlayersVisual {
  group = new Group();
  private visuals = new Map<string, Visual>();
  update(players: RemotePlayerState[], frame: Frame) {
    const active = new Set(players.map((player) => player.playerId));
    for (const [id, visual] of this.visuals) if (!active.has(id)) {
      this.group.remove(visual.root); this.visuals.delete(id);
    }
    for (const player of players) {
      let visual = this.visuals.get(player.playerId);
      if (!visual) {
        const ship = makeShip(), root = new Group(), label = makeLabel(player.callsign);
        root.add(ship.group, label); this.group.add(root);
        visual = { ...ship, root, label }; this.visuals.set(player.playerId, visual);
      }
      visual.setVariant(player.ship.definitionId);
      visual.root.visible = player.presence !== 'OFFLINE';
      visual.root.position.copy(frame.local(player.ship.position));
      visual.group.quaternion.copy(frame.eciToLocal).multiply(new Quaternion(...player.ship.orientation));
      visual.setThrust(0);
    }
  }
}
