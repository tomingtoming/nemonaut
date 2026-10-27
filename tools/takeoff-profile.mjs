import {Flight,statistics} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {TakeoffPrototype} from './takeoff-prototype.mjs';
import {runwayApproach,RUNWAY} from '../dist/runway-navigation.js';
import * as T from 'three';
import {bodyUp} from '../dist/celestial.js';
const requested=process.argv.slice(2).find(s=>!s.startsWith('--')),rotation=Number(process.argv.find(s=>s.startsWith('--rotation='))?.split('=')[1]??8);
const hz=Number(process.argv.find(s=>s.startsWith('--hz='))?.split('=')[1]??120);
if(![60,120].includes(hz))throw Error('Supported diagnostic rates: 60 or 120 Hz');
for(const kind of requested?[requested]:['plane','plane-large','transport-cargo'])for(const fraction of [1,.5]){
 const f=new Flight(preset(kind),'runway',161700);f.stageNext();
 for(const [id,amount]of f.fuel)f.fuel.set(id,amount*fraction);
 f.stats=statistics(f.parts,f.fuel,f.ballast,f.thermal);
 const p=new TakeoffPrototype(f,{speed:kind==='plane'?120:90,rotation,abortGuard:process.argv.includes('--abort-guard'),integral:process.argv.includes('--integral'),handoff:process.argv.find(s=>s.startsWith('--handoff='))?.split('=')[1]??'direct'});let handoff=null,peak=0,liftoff=null,lastGround=null,airborneTime=0,groundExit=null,minAfterHandoff=Infinity,maxGroundCross=0;
 try{for(let i=0;i<300*hz&&!f.crashed;i++){
  if(process.argv.includes('--turn')&&p.cruise&&i===180*hz)p.cruise.target.heading=(p.target.heading+20)%360;
  const input=p.update(f,1/hz);f.step(1/hz,input);peak=Math.max(peak,f.orbit.altitude);
  const center=f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),r=runwayApproach(center,f.universalTime,'09',f.vel),along=-r.remaining;
  if(f.telemetry.contacts){lastGround={time:f.time,along,cross:r.crossTrack,height:f.orbit.altitude};maxGroundCross=Math.max(maxGroundCross,Math.abs(r.crossTrack));if(!groundExit&&(along>RUNWAY.length||Math.abs(r.crossTrack)>RUNWAY.width/2))groundExit={time:f.time,along,cross:r.crossTrack};}
  airborneTime=!f.telemetry.contacts&&f.orbit.altitude>10?airborneTime+1/hz:0;
  if(!liftoff&&airborneTime>=1)liftoff={time:f.time,along,remaining:RUNWAY.length-along,cross:r.crossTrack,height:f.orbit.altitude};
  if(p.phase==='cruise'&&!handoff)handoff={time:f.time,...p.telemetry};
  if(handoff)minAfterHandoff=Math.min(minAfterHandoff,f.orbit.altitude);
  if(i%(30*hz)===0||(i<60*hz&&i%hz===0)||(process.argv.includes('--trace-handoff')&&handoff&&f.time-handoff.time<60&&i%hz===0)){
   const up=bodyUp(center,f.universalTime),actualPitch=Math.asin(T.MathUtils.clamp(new T.Vector3(0,0,1).applyQuaternion(f.q).dot(up),-1,1))*180/Math.PI;
   console.log(JSON.stringify({kind,fraction,rotation,t:f.time,phase:p.phase,...(p.cruise?.telemetry??p.telemetry),actualPitch,commands:f.telemetry.commands,stallCount:f.telemetry.stallCount,thrust:f.lastThrust,mass:f.stats.mass}));
  }
  if(p.phase==='stopped')break;
 }console.log(JSON.stringify({kind,fraction,final:true,phase:p.phase,abort:p.abort,handoff,clearance10m:liftoff,lastGround,groundExit,maxGroundCross,minAfterHandoff,peak,height:f.orbit.altitude,speed:f.telemetry.surfaceSpeed,crashed:f.crashed,parts:f.parts.length,cruise:p.cruise?.telemetry}));}
 finally{f.dispose();}
}
