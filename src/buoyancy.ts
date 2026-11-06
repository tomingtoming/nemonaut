import * as T from 'three';
import {PARTS} from './catalog.js';
import {partCenter, partMass, type AeroPart, type MassPart} from './aero.js';

// Same displaced volume as the two buoyancy samples in Flight. This is the
// fully submerged center, not the changing center of a partly immersed hull.
export type BuoyantPart = AeroPart & MassPart;
export interface BuoyancyBalance {
  center: T.Vector3;
  com: T.Vector3;
  volume: number;
  mass: number;
  displacement: number;
}
/** Water density (kg/m³) of buoyancy and of submerged lifting surfaces. Water is at rest on the surface. */
export const WATER_DENSITY = 1000;
/**
 * Submerged fraction of a part sampled at a point `altitude` (m) above the water surface, where
 * `verticalExtent` is the part's half extent along the local vertical. A linear ramp over the
 * part's height (at least 12 cm); the buoyancy samples in Flight use the same ramp.
 */
export function submergedFraction(altitude: number, verticalExtent: number): number {
  const depth = Math.max(0.12, verticalExtent * 1.2);
  return Math.max(0, Math.min(1, (depth / 2 - altitude) / depth));
}
/**
 * Density of the fluid around a surface part that is `submerged` (0..1) in water: air and water
 * blended by the submerged fraction (BACKLOG 9b). Exactly the air density when not submerged.
 */
export function mediumDensity(airDensity: number, submerged: number): number {
  return submerged > 0 ? airDensity + (WATER_DENSITY - airDensity) * Math.min(1, submerged) : airDensity;
}
export function displacedVolume(p: Pick<AeroPart, 'type'>): number {
  const d = PARTS[p.type];
  return d.volume || d.size[0] * d.size[1] * d.size[2] * 0.18;
}
/** Per-sample water damping, expressed in world coordinates. */
export function waterResistance(
  p: Pick<AeroPart, 'type'>,
  orientation: T.Quaternion,
  velocity: T.Vector3,
  submersion: number
): T.Vector3 {
  const force = velocity.clone(),
    factors = PARTS[p.type].waterResistance;
  if (factors) {
    force.applyQuaternion(orientation.clone().invert());
    force.multiply(new T.Vector3(...factors)).applyQuaternion(orientation);
  }
  return force.multiplyScalar(-submersion * displacedVolume(p) * 500);
}
export function buoyancyBalance(parts: Iterable<BuoyantPart>, ballast = 0): BuoyancyBalance {
  const center = new T.Vector3(),
    com = new T.Vector3();
  let volume = 0,
    mass = 0;
  for (const p of parts) {
    const v = displacedVolume(p),
      m = partMass(p, 1, ballast),
      point = partCenter(p);
    volume += v;
    mass += m;
    center.addScaledVector(point, v);
    com.addScaledVector(point, m);
  }
  center.divideScalar(volume || 1);
  com.divideScalar(mass || 1);
  return {center, com, volume, mass, displacement: volume * WATER_DENSITY};
}
