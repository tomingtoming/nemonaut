import * as T from 'three';
import {PARTS} from './catalog.js';
export const partRotation=p=>new T.Quaternion().setFromEuler(new T.Euler(...p.r));
export function partMass(p,fuel=1,ballast=0){const d=PARTS[p.type];return d.mass+(d.fuel||0)*fuel+(d.ballast||0)*ballast;}
export function partCenter(p){return new T.Vector3(...(PARTS[p.type].massCenter||[0,0,0])).applyQuaternion(partRotation(p)).add(new T.Vector3(...p.p));}
export function aeroPoint(p){return new T.Vector3(...(PARTS[p.type].ac||[0,0,0])).applyQuaternion(partRotation(p)).add(new T.Vector3(...p.p));}
export function aeroAnalysis(parts,com){const center=new T.Vector3();let weight=0,chord=0,area=0;for(const p of parts){const d=PARTS[p.type];if(!d.wing)continue;const normal=new T.Vector3(0,0,1).applyQuaternion(partRotation(p)),w=d.wing*normal.y**2;center.addScaledVector(aeroPoint(p),w);weight+=w;chord+=w*(d.chord||1);area+=d.wing;}center.divideScalar(weight||1);chord/=weight||1;return {center,area,chord,weight,staticMargin:weight?(com.z-center.z)/(chord||1):null};}
export function surfaceForce(p,orientation,velocity,density,deflection=0){
 const d=PARTS[p.type],normal=new T.Vector3(0,0,1),forward=new T.Vector3(0,1,0),span=new T.Vector3(1,0,0);
 const hinge=new T.Quaternion().setFromAxisAngle(span,deflection);normal.applyQuaternion(hinge).applyQuaternion(orientation);forward.applyQuaternion(hinge).applyQuaternion(orientation);span.applyQuaternion(orientation);
 const flow=velocity.clone().addScaledVector(span,-velocity.dot(span)),speed=flow.length();if(speed<.05)return {force:new T.Vector3(),alpha:0,cl:0,stalled:false};
 const alpha=Math.atan2(-flow.dot(normal),flow.dot(forward)),a=Math.abs(alpha),stall=15*Math.PI/180;
 const cl=a<=stall?4.5*alpha:Math.sign(alpha)*1.18*Math.cos(Math.min(Math.PI/2,(a-stall)*1.4));
 const cd=.022+.065*cl*cl+1.2*Math.sin(alpha)**2;const direction=flow.clone().normalize();
 const lift=normal.clone().addScaledVector(direction,-normal.dot(direction)).normalize();
 const q=.5*density*speed*speed*d.wing;
 return {force:lift.multiplyScalar(q*cl).addScaledVector(direction,-q*cd),alpha,cl,stalled:a>stall};
}
export function controlDeflection(p,com,commands){const d=PARTS[p.type];if(!d.controlAxis)return 0;const n=new T.Vector3(0,0,1).applyQuaternion(partRotation(p)),r=aeroPoint(p).sub(com),moment=r.cross(n);if(d.controlAxis==='auto'){const intent=new T.Vector3(commands.pitch||0,commands.yaw||0,commands.roll||0);return T.MathUtils.clamp(moment.normalize().dot(intent),-1,1)*(d.maxDeflection||18)*Math.PI/180;}const axis={pitch:'x',yaw:'y',roll:'z'}[d.controlAxis];const sign=Math.sign(moment[axis]);return sign*(commands[d.controlAxis]||0)*(d.maxDeflection||25)*Math.PI/180;}
