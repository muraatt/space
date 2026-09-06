import {
  Group,
  Mesh,
  MeshStandardNodeMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
} from 'three/webgpu';
import { CONFIG } from '@orbital/shared';
import { dot, normalWorld, smoothstep, texture } from 'three/tsl';
import { makeAtmosphere } from './atmosphere';
export async function makeEarth() {
  const loader = new TextureLoader();
  const [map, night, clouds] = await Promise.all(
    ['earth-day-8k.png', 'earth-night-8k.jpg', 'earth-clouds.jpg'].map((name) =>
      loader.loadAsync(`/textures/${name}`),
    ),
  );
  for (const t of [map, night]) t.colorSpace = SRGBColorSpace;
  for (const t of [map, night, clouds]) t.anisotropy = 8;
  const atmosphere = makeAtmosphere(),
    material = new MeshStandardNodeMaterial({ map, roughness: 0.92, metalness: 0 });
  material.emissiveNode = texture(night)
    .rgb.mul(smoothstep(-0.12, 0.15, dot(normalWorld, atmosphere.sun)).oneMinus())
    .mul(0.7);
  const group = new Group(),
    surface = new Mesh(new SphereGeometry(CONFIG.earthRadius / 1000, 128, 64), material);
  const cloudMaterial = new MeshStandardNodeMaterial({
    color: '#ffffff',
    alphaMap: clouds,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    roughness: 1,
  });
  const cloudLayer = new Mesh(new SphereGeometry(CONFIG.earthRadius / 1000 + 4, 128, 64), cloudMaterial);
  group.add(surface, cloudLayer, atmosphere.group);
  return { group, surface, atmosphere };
}
