import { CONFIG, type DockingMetrics, type DockingPortState, type ShipState, type StationState } from '@orbital/shared';
import { add, cross, dot, length, normalize, rotate, scale, sub } from './coordinates';

const degrees = (radians: number) => radians * 180 / Math.PI;

export function stationPortWorld(station: StationState, port: DockingPortState) {
  return {
    position: add(station.position, rotate(port.capturePointLocal, station.orientation)),
    approachAxis: normalize(rotate(port.approachAxisLocal, station.orientation)),
    upAxis: normalize(rotate(port.upAxisLocal, station.orientation)),
  };
}

export function dockingMetrics(ship: ShipState, station: StationState, port: DockingPortState): DockingMetrics {
  const worldPort = stationPortWorld(station, port),
    offset = sub(ship.position, worldPort.position),
    relativeVelocity = sub(ship.velocity, station.velocity),
    rangeM = length(offset),
    axialDistanceM = dot(offset, worldPort.approachAxis),
    lateral = sub(offset, scale(worldPort.approachAxis, axialDistanceM)),
    rightAxis = normalize(cross(worldPort.upAxis, worldPort.approachAxis)),
    desiredForward = scale(worldPort.approachAxis, -1),
    shipForward = normalize(rotate([0, 0, -1], ship.orientation)),
    shipUp = normalize(rotate([0, 1, 0], ship.orientation)),
    forward = Math.max(-1, Math.min(1, dot(shipForward, desiredForward))),
    signedForward = dot(shipForward, desiredForward),
    directionError = (offAxis: number) =>
      Math.abs(offAxis) < 1e-12 && Math.abs(signedForward) < 1e-12
        ? 0
        : degrees(Math.atan2(offAxis, signedForward));
  return {
    rangeM,
    relativeSpeedMps: length(relativeVelocity),
    closingSpeedMps: rangeM > 1e-6 ? -dot(relativeVelocity, normalize(offset)) : 0,
    axialDistanceM,
    lateralErrorM: length(lateral),
    verticalErrorM: dot(offset, worldPort.upAxis),
    forwardAlignment: forward,
    yawErrorDeg: directionError(dot(shipForward, rightAxis)),
    pitchErrorDeg: directionError(dot(shipForward, worldPort.upAxis)),
    rollErrorDeg: degrees(Math.atan2(dot(shipUp, rightAxis), dot(shipUp, worldPort.upAxis))),
  };
}

export function dockingGuidance(metrics: DockingMetrics, port: DockingPortState) {
  if (metrics.relativeSpeedMps > port.maxRelativeSpeedMps || Math.abs(metrics.closingSpeedMps) > port.maxClosingSpeedMps)
    return 'TOO_FAST' as const;
  if (metrics.lateralErrorM > port.maxLateralErrorM || metrics.axialDistanceM < 0)
    return 'ALIGN_POSITION' as const;
  const alignmentLimit = Math.cos(port.maxAlignmentErrorDeg * Math.PI / 180);
  if (metrics.forwardAlignment < alignmentLimit || Math.abs(metrics.rollErrorDeg) > port.maxRollErrorDeg)
    return 'ALIGN_ATTITUDE' as const;
  if (metrics.rangeM <= port.captureRadiusM) return 'READY' as const;
  return metrics.rangeM <= CONFIG.stationFinalApproachRangeM ? 'APPROACH' as const : 'RENDEZVOUS' as const;
}
