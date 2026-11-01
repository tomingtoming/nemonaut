import * as T from 'three';
import {PLANET,center} from './planet.js';

// Physical/orbit parameters: KittopiaTech stock Mun dump (see CELESTIAL.md).
export const MOON=Object.freeze({id:'moon',name:'月',radius:200000,mu:65138397520.7807,atmosphereTop:0,orbitRadius:12000000,phase:1.70000004768372,sphereOfInfluence:2429559.11656475});
export const PRIMARY=Object.freeze({...PLANET,id:'planet',name:'母星'});
export const MOON_RATE=Math.sqrt(PRIMARY.mu/MOON.orbitRadius**3);
export const MOON_PERIOD=2*Math.PI/MOON_RATE;

export function bodyState(body,time=0){
 if(body.id==='planet')return {position:center.clone(),velocity:new T.Vector3()};
 if(body.id!=='moon')throw Error('未知の天体です');
 const angle=MOON.phase+(time%MOON_PERIOD)*MOON_RATE,c=Math.cos(angle),s=Math.sin(angle),r=MOON.orbitRadius;
 // The initial 80 km trial orbit lies in YZ, so the moon uses that same plane.
 return {position:center.clone().add(new T.Vector3(0,r*c,r*s)),velocity:new T.Vector3(0,-r*MOON_RATE*s,r*MOON_RATE*c)};
}
export function referenceBody(position,time=0){return position.distanceToSquared(bodyState(MOON,time).position)<MOON.sphereOfInfluence**2?MOON:PRIMARY;}
export function relativeMotion(position,velocity,time=0,body=referenceBody(position,time)){
 const state=bodyState(body,time);return {body,center:state.position,bodyVelocity:state.velocity,r:position.clone().sub(state.position),velocity:velocity.clone().sub(state.velocity)};
}
export function bodyAltitude(position,time=0,body=referenceBody(position,time)){return position.distanceTo(bodyState(body,time).position)-body.radius;}
export function bodyUp(position,time=0,body=referenceBody(position,time)){return position.clone().sub(bodyState(body,time).position).normalize();}
export function bodyGravity(position,time=0,body=referenceBody(position,time)){const r=position.clone().sub(bodyState(body,time).position);return r.multiplyScalar(-body.mu/Math.max(1,r.length())**3);}

export function bodyOrbitState(position,velocity,time=0,body=referenceBody(position,time)){
 const relative=relativeMotion(position,velocity,time,body),r=relative.r,v=relative.velocity,radius=r.length(),h=r.clone().cross(v),evec=v.clone().cross(h).divideScalar(body.mu).sub(r.clone().divideScalar(radius)),e=evec.length(),energy=v.lengthSq()/2-body.mu/radius,p=h.lengthSq()/body.mu,a=energy<0?-body.mu/(2*energy):Infinity;
 const periapsis=p/(1+e)-body.radius,apoapsis=energy<0?a*(1+e)-body.radius:Infinity;
 return {body,bodyId:body.id,center:relative.center,bodyVelocity:relative.bodyVelocity,relativeVelocity:v,universalTime:time,altitude:radius-body.radius,speed:v.length(),vertical:v.dot(r)/radius,circularSpeed:Math.sqrt(body.mu/radius),gravity:body.mu/radius**2,eccentricity:e,energy,periapsis,apoapsis,period:energy<0?2*Math.PI*Math.sqrt(a**3/body.mu):Infinity,p,evec,normal:h.normalize(),radius,r,stable:energy<0&&periapsis>body.atmosphereTop};
}

function localStep(r,v,acceleration,mu,dt){
 const gravity=r=>r.clone().multiplyScalar(-mu/Math.max(1,r.length())**3);
 const half=v.clone().addScaledVector(gravity(r).add(acceleration),dt/2),next=r.clone().addScaledVector(half,dt);
 return {position:next,velocity:half.addScaledVector(gravity(next).add(acceleration),dt/2)};
}

// Patched conics in a common, nonrotating parent frame. Moon-relative motion
// is integrated locally, then translated with exact ephemerides at the end.
// No instantaneous position/velocity change occurs when the selected body changes.
export function advanceCelestialOrbit(position,velocity,acceleration,dt,time=0){
 const relative=relativeMotion(position,velocity,time),body=relative.body;
 const next=localStep(relative.r,relative.velocity,acceleration,body.mu,dt),end=bodyState(body,time+dt);
 const pos=next.position.add(end.position),vel=next.velocity.add(end.velocity);
 return {pos,vel,bodyId:referenceBody(pos,time+dt).id};
}

export function lunarTrial(time=0,altitude=20000){
 const state=bodyState(MOON,time),r=MOON.radius+altitude;
 return {pos:state.position.add(new T.Vector3(0,r,0)),vel:state.velocity.add(new T.Vector3(0,0,Math.sqrt(MOON.mu/r)))};
}
