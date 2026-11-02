import {storageKey} from './app-id.js';
export const SURVEY_TARGET_SECONDS = 9000;
import * as T from 'three';
import {PRIMARY} from './celestial.js';
import {fixedToInertial, inertialToFixed} from './surface-frame.js';
export interface DeliverySite {
  id: string;
  name: string;
  north: number;
  east: number;
  radius: number;
}
export const DELIVERY_SITE: DeliverySite = Object.freeze({
  id: 'north-station',
  name: '北観測点',
  north: 600,
  east: 0,
  radius: 30
});
export const DELIVERY_SITES = Object.freeze([
  DELIVERY_SITE,
  Object.freeze({id: 'east-station', name: '東観測点', north: 0, east: 3000, radius: 30})
]);
export const deliverySite = (id: unknown): DeliverySite | undefined => DELIVERY_SITES.find(s => s.id === id);
let selected: DeliverySite = DELIVERY_SITE;
try {
  selected = deliverySite(localStorage.getItem(storageKey('site'))) ?? selected;
} catch {}
export const selectedDeliverySite = () => selected;
export function selectDeliverySite(id: string): DeliverySite {
  selected = deliverySite(id) ?? DELIVERY_SITE;
  try {
    localStorage.setItem(storageKey('site'), selected.id);
  } catch {}
  return selected;
}
function fixedSite(site: DeliverySite): T.Vector3 {
  const n = site.north / PRIMARY.radius,
    e = (site.east ?? 0) / PRIMARY.radius;
  return new T.Vector3(Math.sin(n), Math.cos(n) * Math.cos(e), Math.cos(n) * Math.sin(e));
}
export function deliverySitePosition(time = 0, site: DeliverySite = DELIVERY_SITE) {
  return fixedToInertial(fixedSite(site).multiplyScalar(PRIMARY.radius), time, PRIMARY);
}
// Arc distance ignores altitude; eligibility separately checks ground contact.
export function deliveryDistance(point: T.Vector3, time = 0, site: DeliverySite = DELIVERY_SITE) {
  const fixed = inertialToFixed(point, time, PRIMARY);
  return fixed.angleTo(fixedSite(site)) * PRIMARY.radius;
}

export function deliveryBearing(point: T.Vector3, time = 0, site: DeliverySite = DELIVERY_SITE) {
  const fixed = inertialToFixed(point, time, PRIMARY),
    up = fixed.clone().normalize(),
    north = new T.Vector3(1, 0, 0).addScaledVector(up, -up.x).normalize(),
    east = new T.Vector3(1, 0, 0).cross(up).normalize();
  const target = fixedSite(site);
  const tangent = target.addScaledVector(up, -target.dot(up));
  if (tangent.lengthSq() < 1e-16 || north.lengthSq() < 0.5) return null;
  return ((Math.atan2(tangent.dot(east), tangent.dot(north)) * 180) / Math.PI + 360) % 360;
}
