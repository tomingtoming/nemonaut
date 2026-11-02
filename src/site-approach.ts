import {PRIMARY, bodyState, referenceBody} from './celestial.js';
import {surfaceRelativeVelocity} from './surface-frame.js';
import {deliverySitePosition, type DeliverySite} from './delivery-sites.js';
export interface SiteApproachVessel {
  pos: import('three').Vector3;
  vel: import('three').Vector3;
  q: import('three').Quaternion;
  stats: {com: import('three').Vector3};
  universalTime: number;
}
export interface SiteApproach {
  horizontal: number;
  closing: number | null;
}

// Speeds projected onto the surface, in the same frame as the site's arc distance.
export function siteApproach(v: SiteApproachVessel, site: DeliverySite): SiteApproach | null {
  const center = v.pos.clone().add(v.stats.com.clone().applyQuaternion(v.q)),
    time = v.universalTime;
  if (referenceBody(center, time).id !== PRIMARY.id) return null;
  const radial = center.clone().sub(bodyState(PRIMARY, time).position),
    radius = radial.length(),
    up = radial.divideScalar(radius);
  const velocity = surfaceRelativeVelocity(center, v.vel, time, PRIMARY);
  const horizontal = velocity.addScaledVector(up, -velocity.dot(up)).multiplyScalar(PRIMARY.radius / radius);
  const toward = deliverySitePosition(time, site).sub(center);
  toward.addScaledVector(up, -toward.dot(up));
  const speed = horizontal.length(),
    closing = toward.lengthSq() < 1e-8 ? null : horizontal.dot(toward.normalize());
  return {horizontal: speed, closing};
}
export function siteApproachText(v: SiteApproachVessel, site: DeliverySite): string {
  const motion = siteApproach(v, site);
  if (!motion) return '';
  const closing = motion.closing;
  return (
    (closing === null
      ? '目標上空'
      : (closing < -0.05 ? '離脱 ' : '接近 ') + Math.abs(closing).toFixed(1) + ' m/s') +
    ' · 水平 ' +
    motion.horizontal.toFixed(1) +
    ' m/s'
  );
}
