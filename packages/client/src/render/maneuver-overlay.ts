import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Points,
  PointsMaterial,
} from 'three/webgpu';
import type { ManeuverCandidate, Vec3, WorldState } from '@orbital/shared';
import { add, cross, dot, normalize, propagateKepler, scale } from '@orbital/simulation';
import type { renderFrame } from './render-frame';

type Frame = ReturnType<typeof renderFrame>;

const points = (color: string, opacity = 1) => {
  const geometry = new BufferGeometry(),
    material = new LineBasicMaterial({ color, transparent: opacity < 1, opacity });
  return { geometry, material };
};

export class ManeuverOverlay {
  readonly group = new Group();
  private readonly currentParts = points('#79a9bd', 0.55);
  private readonly targetParts = points('#d7a36d', 0.7);
  private readonly transferParts = points('#e5c08c', 0.95);
  private readonly current = new Line(this.currentParts.geometry, this.currentParts.material);
  private readonly target = new Line(this.targetParts.geometry, this.targetParts.material);
  private readonly transfer = new Line(this.transferParts.geometry, this.transferParts.material);
  private readonly markers = new Points(
    new BufferGeometry(),
    new PointsMaterial({ color: '#fff0bf', size: 5, sizeAttenuation: false }),
  );
  private targetRadiusM?: number;
  private candidate?: ManeuverCandidate;

  constructor() {
    this.group.name = 'maneuver-overlay';
    this.group.visible = false;
    this.group.add(this.current, this.target, this.transfer, this.markers);
    this.group.traverse((object) => {
      object.frustumCulled = false;
    });
  }

  setPlan(targetRadiusM?: number, candidate?: ManeuverCandidate) {
    this.targetRadiusM = targetRadiusM;
    this.candidate = candidate;
    this.group.visible = targetRadiusM !== undefined;
    this.transfer.visible = !!candidate;
    this.markers.visible = !!candidate;
  }

  private setGeometry(geometry: BufferGeometry, eciPoints: Vec3[], frame: Frame) {
    const values = eciPoints.flatMap((point) => {
      const local = frame.local(point).multiplyScalar(0.001);
      return [local.x, local.y, local.z];
    });
    geometry.setAttribute('position', new Float32BufferAttribute(values, 3));
    geometry.computeBoundingSphere();
  }

  private ring(radiusM: number, first: Vec3, second: Vec3) {
    return Array.from({ length: 97 }, (_, index) => {
      const angle = (index / 96) * Math.PI * 2;
      return add(scale(first, Math.cos(angle) * radiusM), scale(second, Math.sin(angle) * radiusM));
    });
  }

  update(world: WorldState, frame: Frame) {
    if (!this.group.visible || !this.targetRadiusM) return;
    const normal = normalize(cross(world.ship.position, world.ship.velocity)),
      first = normalize(world.ship.position),
      second = normalize(cross(normal, first)),
      currentRadius = Math.hypot(...world.ship.position);
    this.setGeometry(this.current.geometry, this.ring(currentRadius, first, second), frame);
    this.setGeometry(this.target.geometry, this.ring(this.targetRadiusM, first, second), frame);
    if (!this.candidate) return;
    const departure = this.candidate.burns[0]?.offsetSeconds
        ? propagateKepler(
            { position: world.ship.position, velocity: world.ship.velocity },
            this.candidate.burns[0].offsetSeconds,
          ).position
        : world.ship.position,
      arrival = this.candidate.expectedFinalState.position,
      departureUnit = normalize(departure),
      transferSecond = normalize(cross(normal, departureUnit));
    let angle = Math.atan2(dot(arrival, transferSecond), dot(arrival, departureUnit));
    if (angle <= 0) angle += Math.PI * 2;
    const departureRadius = Math.hypot(...departure),
      arrivalRadius = Math.hypot(...arrival),
      path = Array.from({ length: 65 }, (_, index) => {
        const amount = index / 64,
          theta = angle * amount,
          smooth = amount * amount * (3 - 2 * amount),
          radius = departureRadius + (arrivalRadius - departureRadius) * smooth;
        return add(
          scale(departureUnit, Math.cos(theta) * radius),
          scale(transferSecond, Math.sin(theta) * radius),
        );
      });
    this.setGeometry(this.transfer.geometry, path, frame);
    this.setGeometry(this.markers.geometry, [departure, arrival], frame);
  }
}
