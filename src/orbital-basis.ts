// The prograde / normal / radial triad of a body-relative state, as the maneuver plans build it. No
// import-time side effects.
import type * as T from 'three';
export interface OrbitalBasis {
  prograde: T.Vector3;
  normal: T.Vector3;
  radial: T.Vector3;
}
/**
 * Unit vectors along the velocity, the orbit normal (position x prograde) and the in-plane outward
 * direction (prograde x normal), for a position and velocity relative to the orbited body. A radial
 * state has no plane: its normal and radial are zero vectors.
 */
export function orbitalBasis(position: T.Vector3, velocity: T.Vector3): OrbitalBasis {
  const prograde = velocity.clone().normalize(),
    normal = position.clone().cross(prograde).normalize(),
    radial = prograde.clone().cross(normal).normalize();
  return {prograde, normal, radial};
}
