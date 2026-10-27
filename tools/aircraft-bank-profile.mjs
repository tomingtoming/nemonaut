// Legacy fixed-duration manual inputs. Reports stalls rather than assuming identical inputs imply identical targets.
import * as T from 'three';import {preset} from '../dist/catalog.js';import {bodyUp} from '../dist/celestial.js';
for(const sign of [-1,1]){
 const {Flight}=await import('../dist/core.js');
 const f=new Flight(preset('plane-large'),'runway',160658.7);f.stageNext();f.throttle=1;let first=null,maxStall=0,minClimb=Infinity,maxError=0;
 try{for(let i=0;i<150*120&&!f.crashed;i++){
 const t=i/120,pitch=t>=33.6&&t<41.6?-1:t>=41.6&&t<43.6?1:t>=43.6&&t<44.3?-1:t>=67.8&&t<68.15?-1:t>=84&&t<84.3?-1:0;
 const roll=sign*(t>=44.3&&t<45.5?1:t>=65.5&&t<66.2?-1:t>=67.45&&t<67.8?-1:t>=83.8&&t<84?-1:0);
 f.step(1/120,{pitch,roll});if(t>110){minClimb=Math.min(minClimb,f.orbit.vertical);maxError=Math.max(maxError,f.q.angleTo(f.holdQ)*180/Math.PI);maxStall=Math.max(maxStall,f.telemetry.stallCount);
 if(!first&&f.telemetry.stallCount)first={t,h:f.orbit.altitude,vs:f.orbit.vertical,speed:f.telemetry.surfaceSpeed,pitch:Math.asin(new T.Vector3(0,0,1).applyQuaternion(f.q).dot(bodyUp(f.pos,f.universalTime)))*180/Math.PI,targetPitch:Math.asin(new T.Vector3(0,0,1).applyQuaternion(f.holdQ).dot(bodyUp(f.pos,f.universalTime)))*180/Math.PI,commands:f.telemetry.commands,deflections:[...f.deflections].filter(([id])=>Math.abs(f.deflections.get(id))>.1).map(([id,a])=>[f.parts.find(p=>p.id===id).type,a*180/Math.PI])};
 }}console.log(JSON.stringify({sign,first,maxStall,minClimb,maxError,crashed:f.crashed}));}finally{f.dispose()}
}
