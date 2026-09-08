import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardNodeMaterial,
  Quaternion,
  RingGeometry,
  TorusGeometry,
} from 'three/webgpu';
import type { WorldState } from '@orbital/shared';
import type { renderFrame } from './render-frame';

export class StationVisual {
  group = new Group();
  guidance = new Group();
  private body = new MeshStandardNodeMaterial({ color: '#a9b8bd', metalness: 0.72, roughness: 0.46 });
  private dark = new MeshStandardNodeMaterial({ color: '#25343d', metalness: 0.8, roughness: 0.55 });
  private solar = new MeshStandardNodeMaterial({ color: '#214f68', metalness: 0.35, roughness: 0.4 });
  private port = new MeshBasicMaterial({ color: '#e0b16f' });
  private guide = new MeshBasicMaterial({ color: '#70d7df', transparent: true, opacity: 0.32, depthWrite: false });

  constructor() {
    this.group.name = 'AEGIS service station';
    const core = new Mesh(new CylinderGeometry(11, 11, 62, 16), this.body);
    core.rotation.x = Math.PI / 2;
    this.group.add(core);
    const hub = new Mesh(new CylinderGeometry(18, 18, 9, 18), this.dark);
    hub.rotation.z = Math.PI / 2;
    this.group.add(hub);
    for (const x of [-1, 1]) {
      const tank = new Mesh(new CylinderGeometry(5, 5, 34, 12), this.body);
      tank.rotation.x = Math.PI / 2;
      tank.position.set(x * 15, -7, -3);
      this.group.add(tank);
      const array = new Mesh(new BoxGeometry(38, 0.5, 13), this.solar);
      array.position.set(x * 32, 5, -4);
      this.group.add(array);
    }
    const spine = new Mesh(new BoxGeometry(74, 2, 3), this.dark);
    spine.position.set(0, 5, -4);
    this.group.add(spine);
    const dockingRing = new Mesh(new TorusGeometry(7, 1.2, 8, 28), this.port);
    dockingRing.position.z = 46;
    this.group.add(dockingRing);
    const capture = new Mesh(new RingGeometry(2.6, 3.2, 28), this.port);
    capture.position.z = 54;
    this.group.add(capture);
    for (const z of [70, 95, 130, 180]) {
      const ring = new Mesh(new TorusGeometry(Math.max(5, z * 0.055), 0.22, 6, 32), this.guide);
      ring.position.z = z;
      this.guidance.add(ring);
    }
    const axis = new Mesh(new CylinderGeometry(0.08, 0.08, 130, 6), this.guide);
    axis.rotation.x = Math.PI / 2;
    axis.position.z = 115;
    this.guidance.add(axis);
    this.group.add(this.guidance);
  }

  update(world: WorldState, frame: ReturnType<typeof renderFrame>) {
    this.group.position.copy(frame.local(world.station.position));
    this.group.quaternion.copy(frame.eciToLocal).multiply(new Quaternion(...world.station.orientation));
    this.group.visible = this.group.position.length() < 50_000;
    this.guidance.visible = world.docking.selectedStationId === world.station.id;
  }
}
