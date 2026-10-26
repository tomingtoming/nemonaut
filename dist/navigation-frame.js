import {bodyAltitude,referenceBody} from './celestial.js';

// Switch well above launch, with a dead band to avoid repeated reversals.
// Airless bodies use 10 km / 8 km; the primary uses 35 km / 28 km.
export function automaticNavigationFrame(altitude,body,previous=null){
 const upper=Math.max(10000,(body.atmosphereTop||0)*.5),lower=upper*.8;
 if(previous==='orbit')return altitude<=lower?'surface':'orbit';
 return altitude>=upper?'orbit':'surface';
}
export function setNavigationFrame(f,frame){
 if(f.navigationFrame!==frame){f.navigationFrame=frame;f.holdQ=f.q.clone();}
}
export function updateNavigationFrame(f,{reset=false,time=f.universalTime}={}){
 if(f.navigationAuto===false)return f.navigationFrame;
 const point=f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),body=referenceBody(point,time);
 setNavigationFrame(f,automaticNavigationFrame(bodyAltitude(point,time,body),body,reset?null:f.navigationFrame));
 return f.navigationFrame;
}
