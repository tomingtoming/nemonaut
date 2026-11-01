import {bodyAltitude,referenceBody} from './celestial.js';
export type NavigationFrame='surface'|'orbit';
export interface NavigationFrameFlight{navigationFrame?:NavigationFrame;navigationAuto?:boolean;holdQ?:import('three').Quaternion|null;q:import('three').Quaternion;pos:import('three').Vector3;stats:{com:import('three').Vector3};universalTime:number}

// Switch well above launch, with a dead band to avoid repeated reversals.
// Airless bodies use 10 km / 8 km; the primary uses 35 km / 28 km.
export function automaticNavigationFrame(altitude:number,body:Pick<import('./celestial.js').BodyPhysics,'atmosphereTop'>,previous:NavigationFrame|null|undefined=null):NavigationFrame{
 const upper=Math.max(10000,(body.atmosphereTop||0)*.5),lower=upper*.8;
 if(previous==='orbit')return altitude<=lower?'surface':'orbit';
 return altitude>=upper?'orbit':'surface';
}
export function setNavigationFrame(f:NavigationFrameFlight,frame:NavigationFrame):void{
 if(f.navigationFrame!==frame){f.navigationFrame=frame;f.holdQ=f.q.clone();}
}
export function updateNavigationFrame(f:NavigationFrameFlight,{reset=false,time=f.universalTime}:{reset?:boolean;time?:number}={}):NavigationFrame|undefined{
 if(f.navigationAuto===false)return f.navigationFrame;
 const point=f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),body=referenceBody(point,time);
 setNavigationFrame(f,automaticNavigationFrame(bodyAltitude(point,time,body),body,reset?null:f.navigationFrame));
 return f.navigationFrame;
}
