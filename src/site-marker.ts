import * as T from 'three';
import {PRIMARY, bodyState} from './celestial.js';
import {DELIVERY_SITE, deliverySitePosition, type DeliverySite} from './delivery-sites.js';
// A HUD beacon anchored three metres over the site; not a physical structure.
export function projectDeliverySite(
  camera: T.Camera,
  time: number,
  width: number,
  height: number,
  site: DeliverySite = DELIVERY_SITE
): {x: number; y: number} | null {
  if (!(width > 0 && height > 0)) return null;
  const center = bodyState(PRIMARY, time).position,
    ground = deliverySitePosition(time, site),
    point = ground.clone().addScaledVector(ground.clone().sub(center).normalize(), 3);
  const origin = camera.getWorldPosition(new T.Vector3()),
    direction = point.clone().sub(origin),
    length = direction.length();
  if (length < 1e-6) return null;
  const hit = new T.Ray(origin, direction.normalize()).intersectSphere(
    new T.Sphere(center, PRIMARY.radius),
    new T.Vector3()
  );
  if (hit && hit.distanceTo(origin) < length - 0.01) return null;
  const p = point.project(camera);
  if (p.z < -1 || p.z > 1 || Math.abs(p.x) > 0.96 || Math.abs(p.y) > 0.92) return null;
  return {x: ((p.x + 1) * width) / 2, y: ((1 - p.y) * height) / 2};
}
