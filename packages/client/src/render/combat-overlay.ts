import {
  AdditiveBlending,
  BufferGeometry,
  Group,
  IcosahedronGeometry,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from 'three/webgpu';
import type { WorldState } from '@orbital/shared';
import type { renderFrame } from './render-frame';

export class CombatOverlay {
  group = new Group();
  private target = new Group();
  private core = new Mesh(
    new IcosahedronGeometry(11, 1),
    new MeshBasicMaterial({ color: '#d78d69', wireframe: true }),
  );
  private ring = new Mesh(
    new RingGeometry(17, 18, 32),
    new MeshBasicMaterial({ color: '#efb277', transparent: true, opacity: 0.85, side: 2 }),
  );
  private missileMeshes = new Map<string, Mesh>();
  private laser = new Line(
    new BufferGeometry(),
    new LineBasicMaterial({ color: '#8de9ff', transparent: true }),
  );
  constructor() {
    this.target.add(this.core, this.ring);
    this.group.add(this.target, this.laser);
    this.group.renderOrder = 9;
    this.laser.visible = false;
  }
  update(world: WorldState, frame: ReturnType<typeof renderFrame>) {
    const contact = world.combat.contacts[0];
    this.target.visible = contact.eligible;
    if (contact.eligible) {
      this.target.position.copy(frame.local(contact.position));
      this.target.quaternion.copy(frame.eciToLocal);
      this.ring.lookAt(new Vector3(0, 0, 0));
      const selected = world.combat.selectedTargetId === contact.id;
      (this.core.material as MeshBasicMaterial).color.set(selected ? '#ff815f' : '#d78d69');
      this.ring.scale.setScalar(selected ? 1.25 : 1);
    }
    const activeIds = new Set<string>();
    for (const missile of world.combat.missiles.filter((item) => item.status === 'ACTIVE')) {
      activeIds.add(missile.id);
      let mesh = this.missileMeshes.get(missile.id);
      if (!mesh) {
        mesh = new Mesh(
          new SphereGeometry(2.2, 8, 8),
          new MeshBasicMaterial({
            color: missile.targetId === world.ship.id ? '#ff5f47' : '#8ddcff',
            transparent: true,
            opacity: 0.9,
            blending: AdditiveBlending,
          }),
        );
        this.missileMeshes.set(missile.id, mesh);
        this.group.add(mesh);
      }
      mesh.position.copy(frame.local(missile.position));
    }
    for (const [id, mesh] of this.missileMeshes) {
      if (activeIds.has(id)) continue;
      this.group.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as MeshBasicMaterial).dispose();
      this.missileMeshes.delete(id);
    }
    const laserEvent = [...world.combat.events].reverse().find((event) => event.type === 'LASER_FIRED');
    this.laser.visible = !!laserEvent && world.combat.serverNowMs - laserEvent.atMs < 300;
    if (this.laser.visible && contact) {
      this.laser.geometry.dispose();
      this.laser.geometry = new BufferGeometry().setFromPoints([
        new Vector3(0, 0, 0),
        frame.local(contact.position),
      ]);
    }
  }
}
