import * as T from 'three';
import {PLANET,radial,orbitState} from './planet.js';

// Osculating two-body conics, in common planet-centered coordinates (meters).
// Curves are geometry, not predictions of drag, propulsion or collision response.
export function orbitSegments(position,velocity,{stopped=false,limit=12*PLANET.radius,samples=720}={}){
 if(stopped)return [];
 const orbit=orbitState(position,velocity),r=radial(position),normal=r.clone().cross(velocity);
 if(!Number.isFinite(orbit.p)||orbit.p<1||normal.lengthSq()<1)return [];
 normal.normalize();const x=orbit.eccentricity>1e-7?orbit.evec.clone().normalize():r.clone().normalize(),y=normal.clone().cross(x).normalize();
 const e=orbit.eccentricity,extent=e<1?Math.PI:Math.acos(-1/e)-1e-5,segments=[];let previous=null;
 for(let i=0;i<=samples;i++){
  const angle=-extent+2*extent*i/samples,denominator=1+e*Math.cos(angle),radius=orbit.p/denominator;
  const point=denominator>0&&radius>=PLANET.radius&&radius<=limit?x.clone().multiplyScalar(radius*Math.cos(angle)).addScaledVector(y,radius*Math.sin(angle)):null;
  if(point&&previous){const delta=point.clone().sub(previous),t=T.MathUtils.clamp(-previous.dot(delta)/delta.lengthSq(),0,1),nearest=previous.clone().addScaledVector(delta,t);if(nearest.length()>=PLANET.radius)segments.push([previous.toArray(),point.toArray()]);}
  previous=point;
 }
 return segments;
}
export function projectTrackingPoint(point,yaw,pitch){
 const [x,y,z]=point,xx=Math.cos(yaw)*x+Math.sin(yaw)*z,zz=-Math.sin(yaw)*x+Math.cos(yaw)*z;
 return [xx,Math.cos(pitch)*y-Math.sin(pitch)*zz,Math.sin(pitch)*y+Math.cos(pitch)*zz];
}
