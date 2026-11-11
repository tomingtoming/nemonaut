import {PARTS} from './catalog.js';
import {partCenter, type AeroPart} from './aero.js';
import {referenceBody} from './celestial.js';
import {overWater, surfaceRelativeVelocity, surfaceAngularVelocity} from './surface-frame.js';
import {centerOfMass} from './center-of-mass.js';
/** The vessel fields isParked reads (a Flight satisfies it). */
export interface ParkedVessel {
  pos: import('three').Vector3;
  q: import('three').Quaternion;
  vel: import('three').Vector3;
  omega: import('three').Vector3;
  universalTime: number;
  time: number;
  landed?: boolean;
  landedTime: number;
  brake?: boolean;
  telemetry: {contacts: number};
  stats: {com: import('three').Vector3};
  parts: readonly AeroPart[];
  environment?: string;
}
export function isParked(v: ParkedVessel): boolean | undefined {
  const body = referenceBody(v.pos, v.universalTime);
  const contact = (v.landed && v.landedTime > 0.5) || (v.brake && v.time > 0.5 && v.telemetry.contacts > 0);
  const speed = surfaceRelativeVelocity(centerOfMass(v), v.vel, v.universalTime, body).length(),
    spin = v.omega.clone().sub(surfaceAngularVelocity(body)).length();
  // Bound solver jitter at the outermost material point, not just COM. A long
  // vehicle must not qualify while its extremities sweep across the surface.
  const radius = v.parts.reduce(
    (r, p) => Math.max(r, partCenter(p).distanceTo(v.stats.com) + Math.hypot(...PARTS[p.type].size) / 2),
    0
  );
  return (
    contact &&
    !overWater(v.pos, v.universalTime, body) &&
    speed < 0.1 &&
    spin < 0.02 &&
    speed + spin * radius < 0.2
  );
}
