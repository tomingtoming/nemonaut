import * as T from 'three';
import {PRIMARY_ROTATION_RATE} from './surface-frame.js';
export type LaunchPlaneOwn = Pick<import('./celestial.js').OrbitState, 'bodyId' | 'universalTime'> & {
  r?: T.Vector3 | null;
};
export type LaunchPlaneTarget = Pick<import('./celestial.js').OrbitState, 'bodyId' | 'stable' | 'normal'>;
export type LaunchPlaneGuide =
  | {status: 'unreachable'; error: number}
  | {status: 'always' | 'crossing'; error: number; wait: number; epoch: number; heading: number | null};

// Geometry of a fixed surface site rotating into an inertial orbital plane.
// This is a plane crossing, not an intercept window or an ascent trajectory.
export function launchPlaneGuide(
  own: LaunchPlaneOwn | null | undefined,
  target: LaunchPlaneTarget | null | undefined
): LaunchPlaneGuide | null {
  if (
    own?.bodyId !== 'planet' ||
    target?.bodyId !== 'planet' ||
    !target.stable ||
    target.normal.lengthSq() < 0.5 ||
    !own.r?.lengthSq()
  )
    return null;
  const up = own.r.clone().normalize(),
    n = target.normal.clone().normalize(),
    a = n.y * up.y + n.z * up.z,
    b = n.z * up.y - n.y * up.z,
    c = n.x * up.x,
    amplitude = Math.hypot(a, b),
    error = (Math.asin(Math.min(1, Math.abs(n.dot(up)))) * 180) / Math.PI;
  let wait: number;
  if (amplitude < 1e-12) {
    if (Math.abs(c) > 1e-10) return {status: 'unreachable', error};
    wait = 0;
  } else {
    if (Math.abs(c) > amplitude + 1e-12) return {status: 'unreachable', error};
    const phase = Math.atan2(b, a),
      angle = Math.acos(T.MathUtils.clamp(-c / amplitude, -1, 1)),
      turn = (x: number) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    wait = Math.min(turn(phase - angle), turn(phase + angle)) / PRIMARY_ROTATION_RATE;
    if (error < 1e-8) wait = 0;
  }
  const at = up.clone().applyAxisAngle(new T.Vector3(1, 0, 0), wait * PRIMARY_ROTATION_RATE),
    east = new T.Vector3(1, 0, 0).cross(at),
    direction = n.clone().cross(at).normalize();
  let heading: number | null = null;
  if (east.lengthSq() > 1e-12) {
    east.normalize();
    const north = at.clone().cross(east);
    heading = ((Math.atan2(direction.dot(east), direction.dot(north)) * 180) / Math.PI + 360) % 360;
  }
  return {
    status: amplitude < 1e-12 ? 'always' : 'crossing',
    error,
    wait,
    epoch: own.universalTime + wait,
    heading
  };
}
