import {
  AdditiveBlending,
  BackSide,
  Group,
  Mesh,
  MeshBasicNodeMaterial,
  SphereGeometry,
  Vector3,
} from 'three/webgpu';
import {
  cameraPosition,
  positionWorld,
  uniform,
  color,
  dot,
  normalize,
  max,
  cross,
  length,
  exp,
  smoothstep,
} from 'three/tsl';
import { CONFIG } from '@orbital/shared';
export function makeAtmosphere() {
  const group = new Group(),
    sun = uniform(new Vector3(1, 0.5, -1).normalize()),
    center = uniform(new Vector3());
  const radius = CONFIG.earthRadius / 1000;
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: BackSide,
    blending: AdditiveBlending,
  });
  const radial = positionWorld.sub(center),
    view = normalize(cameraPosition.sub(positionWorld));
  const tangentAltitude = max(length(cross(radial, view)).sub(radius), 0);
  const density = exp(tangentAltitude.div(-11)).mul(smoothstep(30, 80, tangentAltitude).oneMinus());
  // Geometric outward normal: normalWorld reverses on back faces.
  const daylight = max(dot(normalize(radial), sun).mul(0.8).add(0.22), 0.012);
  material.colorNode = color('#63b6ef').mul(2.1);
  material.opacityNode = density.mul(daylight).mul(0.58);
  group.add(new Mesh(new SphereGeometry(radius + 80, 128, 64), material));
  return { group, sun, center };
}
