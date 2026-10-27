import * as T from 'three';
import {PRIMARY,referenceBody} from './celestial.js';
import {inertialToFixed,fixedToInertial,launchSiteOrientation} from './surface-frame.js';
import {compassHeading} from './navigation.js';
export const RUNWAY=Object.freeze({width:18,length:1600,center:650});
export function runwayThreshold(end,time=0){
 const z=RUNWAY.center+(end==='27'?1:-1)*RUNWAY.length/2;
 return fixedToInertial(new T.Vector3(0,PRIMARY.radius-z*z/(2*PRIMARY.radius),z).applyQuaternion(launchSiteOrientation('runway')),time);
}
export function runwayApproach(point,time=0,end='09'){
 if(referenceBody(point,time).id!=='planet')return null;
 const local=inertialToFixed(point,time).applyQuaternion(launchSiteOrientation('runway').invert());
 const threshold=runwayThreshold(end,time),targetLocal=inertialToFixed(threshold,time).applyQuaternion(launchSiteOrientation('runway').invert());
 const direction=end==='27'?-1:1;
 const along=Math.atan2(local.z,local.y)*PRIMARY.radius;
 const start=Math.atan2(targetLocal.z,targetLocal.y)*PRIMARY.radius;
 const distance=local.angleTo(targetLocal)*PRIMARY.radius;
 const bearing=distance<.01?null:compassHeading(threshold.clone().sub(point),point,time);
 return {distance,bearing,remaining:(start-along)*direction,crossTrack:-direction*Math.asin(T.MathUtils.clamp(local.x/local.length(),-1,1))*PRIMARY.radius};
}
