import { Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import { orbitalBasis, toLocal } from '@orbital/simulation';
import type { ShipState, Vec3 } from '@orbital/shared';
export function renderFrame(ship: ShipState) {
  const basis = orbitalBasis(ship.position, ship.velocity);
  const matrix = new Matrix4().makeBasis(
    new Vector3(...basis.right),
    new Vector3(...basis.up),
    new Vector3(...basis.back),
  );
  const eciToLocal = new Quaternion().setFromRotationMatrix(matrix).invert();
  return {
    eciToLocal,
    basis,
    origin: ship.position,
    local: (p: Vec3) => new Vector3(...toLocal(p, ship.position, basis)),
  };
}
