import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardNodeMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  TorusGeometry,
  AdditiveBlending,
  DoubleSide,
} from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import recipe from '../../../../assets/source/starter-ship.recipe.json';
export function makeShip() {
  const group = new Group();
  group.name = recipe.name;
  const palette = [
    recipe.materials.ceramic,
    recipe.materials.structure,
    recipe.materials.radiator,
    recipe.materials.marking,
  ];
  const materials = palette.map(
    (c, i) =>
      new MeshStandardNodeMaterial({
        color: c,
        metalness: i === 0 ? 0.25 : 0.7,
        roughness: i === 2 ? 0.4 : 0.52,
      }),
  );
  const parts: BufferGeometry[][] = [[], [], [], []];
  function part(
    g: BufferGeometry,
    m: number,
    p: [number, number, number],
    rot: [number, number, number] = [0, 0, 0],
  ) {
    g.rotateX(rot[0]);
    g.rotateY(rot[1]);
    g.rotateZ(rot[2]);
    g.translate(...p);
    parts[m].push(g);
  }
  part(new BoxGeometry(2.9, 1.8, 6.2), 1, [0, 0, -0.5]);
  for (const x of [-1, 1])
    for (let z = -2; z <= 2; z += 2) {
      part(new BoxGeometry(0.72, 0.2, 1.84), 0, [x * 0.93, 1.05, z - 0.4]);
      part(new BoxGeometry(0.11, 0.12, 1.4), 3, [x * 0.92, 1.19, z - 0.4]);
    }
  part(new CylinderGeometry(0.88, 1.3, 2.2, 8), 0, [0, 0, -4.3], [Math.PI / 2, 0, 0]);
  part(new TorusGeometry(0.66, 0.16, 8, 28), 1, [0, 0, -5.5]);
  part(new CylinderGeometry(0.54, 0.54, 0.14, 24), 2, [0, 0, -5.53], [Math.PI / 2, 0, 0]);
  part(new BoxGeometry(3.3, 2.1, 1.2), 0, [0, 0, 3.1]);
  for (const x of [-2.2, 2.2])
    for (const y of [-0.72, 0.72]) {
      part(new CapsuleGeometry(0.49, 3.45, 6, 16), 0, [x, y, -0.35], [Math.PI / 2, 0, 0]);
      for (const z of [-1.8, 1.1]) {
        part(new TorusGeometry(0.505, 0.055, 5, 16), 1, [x, y, z]);
      }
      part(new BoxGeometry(0.2, 0.18, 5.1), 1, [x, y + 0.55, -0.3]);
    }
  for (const x of [-1, 1]) {
    part(new BoxGeometry(1.3, 0.15, 3.8), 2, [x * 3.85, 0.3, 0.65]);
    for (let z = -1.1; z < 2.5; z += 0.32) part(new BoxGeometry(1.26, 0.055, 0.045), 0, [x * 3.85, 0.4, z]);
    part(new BoxGeometry(1.8, 0.2, 0.2), 1, [x * 3.05, 0.25, -0.6]);
    part(new BoxGeometry(1.8, 0.2, 0.2), 1, [x * 3.05, 0.25, 1.8]);
  }
  const plumes: Mesh[] = [];
  for (const x of [-0.9, 0.9])
    for (const y of [-0.7, 0.7]) {
      part(new CylinderGeometry(0.33, 0.33, 0.08, 24), 2, [x, y, 3.72], [Math.PI / 2, 0, 0]);
      part(new CylinderGeometry(0.32, 0.68, 1.3, 24, 1, true), 1, [x, y, 4.3], [Math.PI / 2, 0, 0]);
      part(new TorusGeometry(0.68, 0.085, 6, 24), 0, [x, y, 4.95]);
      const flame = new Mesh(
        new ConeGeometry(0.5, 3.5, 16, 1, true),
        new MeshBasicMaterial({
          color: '#8ed1ff',
          transparent: true,
          opacity: 0.4,
          blending: AdditiveBlending,
          depthWrite: false,
          side: DoubleSide,
        }),
      );
      flame.rotation.x = -Math.PI / 2;
      flame.position.set(x, y, 6.5);
      flame.visible = false;
      group.add(flame);
      plumes.push(flame);
    }
  part(new CylinderGeometry(0.04, 0.04, 2.2, 8), 1, [0, 2.05, 1.7]);
  part(new ConeGeometry(0.55, 0.16, 20), 0, [0, 3.16, 1.7]);
  for (let z = -2.6; z < 2.7; z += 0.45) {
    part(new BoxGeometry(0.5, 0.055, 0.055), 1, [1.53, 0.3, z]);
  }
  for (let m = 0; m < parts.length; m++) {
    // Normalize attributes: all primitive sources provide position/normal/uv.
    const merged = mergeGeometries(parts[m], false);
    if (!merged) throw new Error('Ship geometry merge failed');
    const mesh = new Mesh(merged, materials[m]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    for (const g of parts[m]) g.dispose();
  }
  for (const x of [-4.56, 4.56]) {
    const lamp = new Mesh(
      new BoxGeometry(0.08, 0.12, 0.25),
      new MeshBasicMaterial({ color: x < 0 ? '#ed8559' : '#94e9ec' }),
    );
    lamp.position.set(x, 0.35, -0.8);
    group.add(lamp);
  }
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#e7e9df';
  ctx.font = 'bold 54px Consolas';
  ctx.fillText('KESTREL', 20, 66);
  ctx.fillStyle = '#d4a064';
  ctx.font = '26px Consolas';
  ctx.fillText('ST–01  /  EARTH OPS', 22, 115);
  const decal = new CanvasTexture(canvas);
  decal.colorSpace = SRGBColorSpace;
  const label = new Mesh(
    new PlaneGeometry(2.3, 0.72),
    new MeshBasicMaterial({ map: decal, transparent: true, depthWrite: false }),
  );
  label.rotation.x = -Math.PI / 2;
  label.position.set(0, 1.17, 0.25);
  group.add(label);
  return {
    group,
    plumes,
    setThrust(value: number) {
      for (const p of plumes) {
        p.visible = value > 0;
        p.scale.y = 0.5 + value * 0.5;
      }
    },
  };
}
