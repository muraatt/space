import { BufferGeometry, Float32BufferAttribute, Points, PointsMaterial } from 'three/webgpu';
import { seededRandom } from '@orbital/simulation';
export function makeStars(seed = 4401) {
  const rng = seededRandom(seed),
    positions: number[] = [],
    colors: number[] = [];
  for (let i = 0; i < 1500; i++) {
    const y = rng() * 2 - 1,
      a = rng() * Math.PI * 2,
      s = Math.sqrt(1 - y * y),
      r = 20000;
    positions.push(r * s * Math.cos(a), r * y, r * s * Math.sin(a));
    const c = 0.25 + rng() * 0.5;
    colors.push(c * 0.85, c * 0.94, c);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return new Points(
    geometry,
    new PointsMaterial({ size: 1.3, sizeAttenuation: false, vertexColors: true, depthWrite: false }),
  );
}
