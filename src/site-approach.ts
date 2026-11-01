import {PRIMARY,bodyState,referenceBody} from './celestial.js';
import {surfaceRelativeVelocity} from './surface-frame.js';
import {deliverySitePosition} from './delivery-sites.js';

// Speeds projected onto the surface, in the same frame as the site's arc distance.
export function siteApproach(v,site){
 const center=v.pos.clone().add(v.stats.com.clone().applyQuaternion(v.q)),time=v.universalTime;
 if(referenceBody(center,time).id!==PRIMARY.id)return null;
 const radial=center.clone().sub(bodyState(PRIMARY,time).position),radius=radial.length(),up=radial.divideScalar(radius);
 const velocity=surfaceRelativeVelocity(center,v.vel,time,PRIMARY);
 const horizontal=velocity.addScaledVector(up,-velocity.dot(up)).multiplyScalar(PRIMARY.radius/radius);
 const toward=deliverySitePosition(time,site).sub(center);toward.addScaledVector(up,-toward.dot(up));
 const speed=horizontal.length(),closing=toward.lengthSq()<1e-8?null:horizontal.dot(toward.normalize());
 return {horizontal:speed,closing};
}
export function siteApproachText(v,site){
 const motion=siteApproach(v,site);if(!motion)return '';
 const closing=motion.closing;
 return (closing===null?'目標上空':(closing<-.05?'離脱 ':'接近 ')+Math.abs(closing).toFixed(1)+' m/s')+' · 水平 '+motion.horizontal.toFixed(1)+' m/s';
}
