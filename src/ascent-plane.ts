// Orbital-plane geometry for the automatic ascent: the plane normal for a requested inclination
// at the launch point, and the inclination of a state vector. +X is celestial north.
import * as T from 'three';
const north = new T.Vector3(1, 0, 0);
export function ascentPlane(up: T.Vector3, inclination: number): T.Vector3 {
  if (!Number.isFinite(inclination) || inclination < 0 || inclination > 180)
    throw Error('Inclination outside 0–180 degrees');
  const east = north.clone().cross(up),
    cosLatitude = east.length();
  const eastward = Math.cos((inclination * Math.PI) / 180) / cosLatitude;
  if (!Number.isFinite(eastward) || Math.abs(eastward) > 1 + 1e-8)
    throw Error('Requested plane cannot pass through this launch latitude');
  east.normalize();
  const poleward = up.clone().cross(east),
    e = T.MathUtils.clamp(eastward, -1, 1);
  const tangent = east.multiplyScalar(e).addScaledVector(poleward, Math.sqrt(Math.max(0, 1 - e * e)));
  return up.clone().cross(tangent).normalize();
}
export function orbitInclination(radial: T.Vector3, velocity: T.Vector3): number | null {
  const h = radial.clone().cross(velocity);
  return h.lengthSq() > 1e-12 ? (Math.acos(T.MathUtils.clamp(h.normalize().x, -1, 1)) * 180) / Math.PI : null;
}
