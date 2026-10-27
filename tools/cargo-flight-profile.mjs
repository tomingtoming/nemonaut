// Diagnostic pilot only. Normal runway start; ordinary controls, no pose or velocity edits.
// Samples attitude/throttle at 10 Hz. This is not evidence of manual usability or runway return.
import * as T from 'three';import {Flight} from '../dist/core.js';import {preset} from '../dist/catalog.js';import {bodyUp} from '../dist/celestial.js';import {surfaceRelativeVelocity} from '../dist/surface-frame.js';
export function runCargoFlight(epoch=161776.1){
const f=new Flight(preset('transport-cargo'),'runway',epoch);f.stageNext();f.throttle=1;let phase='climb',peak=0,touch=null,command=0;
try{for(let i=0;i<500*120&&!f.crashed&&!f.landed;i++){
 const t=i/120,h=f.orbit?.altitude??0,vs=f.orbit?.vertical??0,speed=surfaceRelativeVelocity(f.pos,f.vel,f.universalTime).length();
 let input=0;
 if(t>=15)f.sas=false;
 if(h>=300&&phase==='climb'){phase='approach';f.sas=false;}
 if((phase==='climb'&&t>=15)||phase==='approach'){
 if(i%12===0){const angle=Math.asin(new T.Vector3(0,0,1).applyQuaternion(f.q).dot(bodyUp(f.pos,f.universalTime)))*180/Math.PI,rate=-f.omega.clone().applyQuaternion(f.q.clone().invert()).x*180/Math.PI;
 const targetVs=h>150?-5:h>20?-2:-1,targetAngle=phase==='climb'?15:T.MathUtils.clamp(6+(targetVs-vs)*.5,-5,15);
 command=T.MathUtils.clamp((angle-targetAngle)*.2+rate*.12,-1,1);f.throttle=phase==='climb'?1:T.MathUtils.clamp(.4+(90-speed)*.03,0,1);}
 input=command;
 }
 if(phase==='brake')input=0;
 const before={t,h,vs,speed};f.step(1/120,{pitch:input});peak=Math.max(peak,f.orbit.altitude);
 if(phase==='approach'&&f.telemetry.contacts){touch={...before,impact:f.telemetry.wheelImpactSpeed};phase='brake';f.throttle=0;f.brake=true;}

 }
 return {flight:f,peak,touch};
}catch(error){f.dispose();throw error;}
}
if(process.argv[1]?.endsWith('cargo-flight-profile.mjs')){
 const {flight:f,peak,touch}=runCargoFlight();
 try{console.log(JSON.stringify({peak,touch,crashed:f.crashed,landed:f.landed,parts:f.parts.length,h:f.orbit.altitude,speed:f.telemetry.surfaceSpeed}));}finally{f.dispose();}
}
