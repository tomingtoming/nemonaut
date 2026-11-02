import {DELIVERY_SITE,deliverySitePosition,type DeliverySite} from './delivery-sites.js';
import {PRIMARY,bodyState} from './celestial.js';
// Match the map's orthographic view basis, with the site facing the viewer.
/** Orthographic map view angles (radians) that put a delivery site facing the viewer. */
export interface MapView{yaw:number;pitch:number}
export function deliveryMapView(time:number,site:DeliverySite=DELIVERY_SITE):MapView{
 const up=deliverySitePosition(time,site).sub(bodyState(PRIMARY,time).position).normalize();
 return {yaw:Math.atan2(-up.x,up.z),pitch:Math.asin(Math.max(-1,Math.min(1,up.y)))};
}
