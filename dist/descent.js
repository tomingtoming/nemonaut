import * as T from 'three';
import {PARTS} from './catalog.js';
import {bodyOrbitState} from './celestial.js';
import {partCenter,partRotation} from './aero.js';
import {engineBurn} from './resources.js';

// Geometry is evaluated at the lowest part, not the vehicle origin or COM.
// Braking figures assume thrust aligned against motion and constant gravity;
// they are conservative guidance, not a promised touchdown prediction.
export function descentTelemetry(v){
 const com=v.pos.clone().add(v.stats.com.clone().applyQuaternion(v.q)),o=bodyOrbitState(com,v.vel,v.universalTime),up=o.r.clone().normalize();
 let clearance=Infinity;
 for(const p of v.parts){
  const rotation=v.q.clone().multiply(partRotation(p)),c=partCenter(p).applyQuaternion(v.q).add(v.pos),[x,y,z]=PARTS[p.type].size;
  for(const a of [-1,1])for(const b of [-1,1])for(const d of [-1,1]){const corner=new T.Vector3(a*x/2,b*y/2,d*z/2).applyQuaternion(rotation).add(c);clearance=Math.min(clearance,corner.distanceTo(o.center)-o.body.radius);}
 }
 const burns=engineBurn(v.networks,new Map(v.fuel),v.started?v.active:new Set(),1,0,.001),force=new T.Vector3();
 for(const p of v.parts){const thrust=burns.get(p.id)||0;if(thrust)force.addScaledVector(new T.Vector3(0,1,0).applyQuaternion(partRotation(p)),thrust);}
 const thrust=force.length(),acceleration=thrust/v.stats.mass,netAcceleration=acceleration-o.gravity,vertical=o.vertical,horizontal=Math.sqrt(Math.max(0,o.speed**2-vertical**2)),fall=Math.max(0,-vertical);
 const brakingDistance=netAcceleration>0?o.speed**2/(2*netAcceleration):Infinity,verticalBrakingDistance=netAcceleration>0?fall*fall/(2*netAcceleration):Infinity;
 const tilt=force.lengthSq()?force.normalize().applyQuaternion(v.q).angleTo(up)*180/Math.PI:null;
 return {body:o.bodyId,clearance,vertical,horizontal,speed:o.speed,gravity:o.gravity,thrust,acceleration,netAcceleration,hoverThrottle:acceleration>0?o.gravity/acceleration:Infinity,brakingDistance,verticalBrakingDistance,tilt,landed:v.landed&&!v.crashed,crashed:v.crashed,legs:v.parts.filter(p=>PARTS[p.type].landingLeg).length};
}
