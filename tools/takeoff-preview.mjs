// Experimental rollout in an isolated physics world, not a live-state shortcut.
import {saveFlight,loadFlight} from '../dist/flight-save.js';
import {TakeoffPrototype} from './takeoff-prototype.mjs';
import {runwayApproach} from '../dist/runway-navigation.js';
export function previewTakeoff(f,p,{seconds=20,hz=120}={}){
 const clone=loadFlight(saveFlight(f));
 const pilot=new TakeoffPrototype(clone,{...p.target,rotation:p.rotation,integral:p.integral,handoff:p.handoffMode});
 pilot.phase=p.phase;pilot.pitchBias=p.pitchBias;pilot.target={...p.target};
 let lastGround=null,airborne=0;
 const begin=performance.now();
 try{
  for(let i=0;i<seconds*hz&&!clone.crashed;i++){
   clone.step(1/hz,pilot.update(clone,1/hz));
   const center=clone.pos.clone().add(clone.stats.com.clone().applyQuaternion(clone.q)),r=runwayApproach(center,clone.universalTime,'09',clone.vel);
   if(clone.telemetry.contacts)lastGround={along:-r.remaining,cross:r.crossTrack,time:clone.time};
   airborne=!clone.telemetry.contacts&&clone.orbit.altitude>10?airborne+1/hz:0;
   if(airborne>=1)return {status:'airborne',lastGround,elapsedMs:performance.now()-begin};
  }
  return {status:clone.crashed?'crashed':'unresolved',lastGround,elapsedMs:performance.now()-begin};
 }finally{clone.dispose();}
}
