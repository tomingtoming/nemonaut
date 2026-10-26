import {deliverySitePosition} from './delivery-sites.js';
import {PRIMARY,bodyState} from './celestial.js';
// Match the map's orthographic view basis, with the site facing the viewer.
export function deliveryMapView(time){
 const up=deliverySitePosition(time).sub(bodyState(PRIMARY,time).position).normalize();
 return {yaw:Math.atan2(-up.x,up.z),pitch:Math.asin(Math.max(-1,Math.min(1,up.y)))};
}
