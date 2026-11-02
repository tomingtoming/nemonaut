import * as T from 'three';
import {PRIMARY, referenceBody} from './celestial.js';
import {
  inertialToFixed,
  fixedToInertial,
  launchSiteOrientation,
  surfaceRelativeVelocity,
  surfaceOrientation
} from './surface-frame.js';
import {compassHeading} from './navigation.js';
import type {RunwayEnd} from './runway-selection.js';
/** Rates (m/s) across and toward the runway threshold, in the approach display's x/y axes. */
export interface RunwayTrack {
  x: number;
  y: number;
}
export interface RunwayApproach {
  distance: number;
  bearing: number | null;
  remaining: number;
  crossTrack: number;
  track: RunwayTrack | null;
}
export const RUNWAY = Object.freeze({width: 18, length: 1600, center: 650});
export function runwayThreshold(end: RunwayEnd | string, time = 0): T.Vector3 {
  const z = RUNWAY.center + ((end === '27' ? 1 : -1) * RUNWAY.length) / 2;
  return fixedToInertial(
    new T.Vector3(0, PRIMARY.radius - (z * z) / (2 * PRIMARY.radius), z).applyQuaternion(
      launchSiteOrientation('runway')
    ),
    time
  );
}
export function runwayApproach(
  point: T.Vector3,
  time = 0,
  end: RunwayEnd | string = '09',
  velocity: T.Vector3 | null = null
): RunwayApproach | null {
  if (referenceBody(point, time).id !== 'planet') return null;
  const local = inertialToFixed(point, time).applyQuaternion(launchSiteOrientation('runway').invert());
  const threshold = runwayThreshold(end, time),
    targetLocal = inertialToFixed(threshold, time).applyQuaternion(launchSiteOrientation('runway').invert());
  const direction = end === '27' ? -1 : 1;
  const along = Math.atan2(local.z, local.y) * PRIMARY.radius;
  const start = Math.atan2(targetLocal.z, targetLocal.y) * PRIMARY.radius;
  const distance = local.angleTo(targetLocal) * PRIMARY.radius;
  const bearing = distance < 0.01 ? null : compassHeading(threshold.clone().sub(point), point, time);
  let track: RunwayTrack | null = null;
  if (velocity) {
    const v = surfaceRelativeVelocity(point, velocity, time, PRIMARY)
      .applyQuaternion(surfaceOrientation(time).invert())
      .applyQuaternion(launchSiteOrientation('runway').invert());
    const r = local.length(),
      horizontal = local.y ** 2 + local.z ** 2;
    if (horizontal > 1) {
      const alongRate = (PRIMARY.radius * (local.y * v.z - local.z * v.y)) / horizontal;
      const crossRate =
        (-direction * PRIMARY.radius * (v.x - (local.x * local.dot(v)) / (r * r))) / Math.sqrt(horizontal);
      const remainingRate = -direction * alongRate;
      if (Math.hypot(crossRate, remainingRate) > 0.5) track = {x: crossRate, y: remainingRate};
    }
  }
  return {
    distance,
    bearing,
    remaining: (start - along) * direction,
    crossTrack: -direction * Math.asin(T.MathUtils.clamp(local.x / local.length(), -1, 1)) * PRIMARY.radius,
    track
  };
}
