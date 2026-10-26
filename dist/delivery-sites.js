import * as T from 'three';
import {PRIMARY} from './celestial.js';
import {fixedToInertial,inertialToFixed} from './surface-frame.js';
export const DELIVERY_SITE=Object.freeze({id:'north-station',name:'北観測点',north:600,radius:30});
export function deliverySitePosition(time=0){
 const a=DELIVERY_SITE.north/PRIMARY.radius;
 return fixedToInertial(new T.Vector3(Math.sin(a),Math.cos(a),0).multiplyScalar(PRIMARY.radius),time,PRIMARY);
}
// Arc distance ignores altitude; eligibility separately checks ground contact.
export function deliveryDistance(point,time=0){
 const fixed=inertialToFixed(point,time,PRIMARY),a=DELIVERY_SITE.north/PRIMARY.radius;
 return fixed.angleTo(new T.Vector3(Math.sin(a),Math.cos(a),0))*PRIMARY.radius;
}

export function deliveryBearing(point,time=0){
 const fixed=inertialToFixed(point,time,PRIMARY),up=fixed.clone().normalize(),north=new T.Vector3(1,0,0).addScaledVector(up,-up.x).normalize(),east=new T.Vector3(1,0,0).cross(up).normalize();
 const a=DELIVERY_SITE.north/PRIMARY.radius,target=new T.Vector3(Math.sin(a),Math.cos(a),0);
 const tangent=target.addScaledVector(up,-target.dot(up));
 if(tangent.lengthSq()<1e-16||north.lengthSq()<.5)return null;
 return (Math.atan2(tangent.dot(east),tangent.dot(north))*180/Math.PI+360)%360;
}
