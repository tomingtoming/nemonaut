// @ts-nocheck: typing debt (BACKLOG 4d). Remove this line once tsc passes the file.
import * as T from 'three';
import {PRIMARY,bodyState,referenceBody} from './celestial.js';

// Stock Kerbin sidereal rotation, KittopiaTech Configs/Kerbin.cfg.
// Our orbital plane is YZ: +X is north, and east at the UT=0 launch
// meridian (+Y) is +Z. This is an axis convention, not a copied KSP frame.
export const PRIMARY_ROTATION_PERIOD=21549.4251830898;
export const PRIMARY_ROTATION_RATE=2*Math.PI/PRIMARY_ROTATION_PERIOD;

export function surfaceAngularVelocity(body=PRIMARY){
 return new T.Vector3(body.id==='planet'?PRIMARY_ROTATION_RATE:0,0,0);
}
export function surfaceOrientation(time=0,body=PRIMARY){
 return new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),body.id==='planet'?(time%PRIMARY_ROTATION_PERIOD)*PRIMARY_ROTATION_RATE:0);
}
// Planet-fixed departures: runway 2 km north, sea launch 4 km south of the pad.
export function launchSiteOrientation(environment){
 return new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),(environment==='runway'?-2000:environment==='water'?4000:0)/PRIMARY.radius);
}
export function fixedToInertial(point,time=0,body=PRIMARY){
 return point.clone().applyQuaternion(surfaceOrientation(time,body)).add(bodyState(body,time).position);
}
export function inertialToFixed(point,time=0,body=referenceBody(point,time)){
 return point.clone().sub(bodyState(body,time).position).applyQuaternion(surfaceOrientation(time,body).invert());
}
// Rigidly co-rotating sea/ground/atmosphere. Wind is not assumed. A point
// above the surface uses its own radius, not the radius of the point below.
export function surfaceVelocity(point,time=0,body=referenceBody(point,time)){
 const state=bodyState(body,time);
 return surfaceAngularVelocity(body).cross(point.clone().sub(state.position)).add(state.velocity);
}
export function surfaceRelativeVelocity(point,velocity,time=0,body=referenceBody(point,time)){
 return velocity.clone().sub(surfaceVelocity(point,time,body));
}
// Add to physical acceleration only inside a co-rotating contact solver.
// Never apply these terms to the existing inertial Kepler integrator.
export function rotatingFrameCorrection(point,relativeVelocity,time=0,body=referenceBody(point,time)){
 const omega=surfaceAngularVelocity(body),r=point.clone().sub(bodyState(body,time).position);
 return omega.clone().cross(relativeVelocity).multiplyScalar(-2).sub(omega.clone().cross(omega.clone().cross(r)));
}

// Damaged vessels retain their body-fixed pose, including airborne wrecks.
// They are suspended records, not falling debris, until recovery/termination.
export function frozenSurfaceState(v,time,dt){
 const body=referenceBody(v.pos,time),turn=surfaceOrientation(dt,body);
 const pos=fixedToInertial(inertialToFixed(v.pos,time,body),time+dt,body);
 const q=v.q.clone().premultiply(turn).normalize();
 const com=pos.clone().add(v.stats.com.clone().applyQuaternion(q));
 return {pos,q,vel:surfaceVelocity(com,time+dt,body),omega:surfaceAngularVelocity(body),turn};
}
