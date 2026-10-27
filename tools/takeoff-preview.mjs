// Experimental rollout in an isolated physics world, not a live-state shortcut.
import {saveFlight,loadFlight} from '../dist/flight-save.js';
import {TakeoffPrototype} from './takeoff-prototype.mjs';
import {runwayApproach} from '../dist/runway-navigation.js';
import {extendWheelTrack} from '../dist/runway-wheel-track.js';
export function previewTakeoff(f,p,{seconds=20,hz=120}={}){
 return runTakeoffPreview(createTakeoffRequest(f,p,{seconds,hz}));
}
export function createTakeoffRequest(f,p,{seconds=20,hz=120}={}){
 if(!Number.isFinite(seconds)||seconds<=0||seconds>60||![60,120].includes(hz))throw Error('Invalid forecast horizon');
 if(p.owner!==f.vesselId||!['roll','rotate'].includes(p.phase))throw Error('Forecast requires the owned departure');
 return {flight:saveFlight(f),pilot:{target:{...p.target},rotation:p.rotation,integral:p.integral,handoffMode:p.handoffMode,phase:p.phase,pitchBias:p.pitchBias},seconds,hz};
}
export function runTakeoffPreview({flight,pilot:p,seconds,hz}){
 if(!Number.isFinite(seconds)||seconds<=0||seconds>60||![60,120].includes(hz))throw Error('Invalid forecast horizon');
 const clone=loadFlight(flight);
 const pilot=new TakeoffPrototype(clone,{...p.target,rotation:p.rotation,integral:p.integral,handoff:p.handoffMode});
 pilot.phase=p.phase;pilot.pitchBias=p.pitchBias;pilot.target={...p.target};
 let lastGround=null,airborne=0,wheelTrack=null;
 const begin=performance.now();
 try{
  for(let i=0;i<seconds*hz&&!clone.crashed;i++){
   clone.step(1/hz,pilot.update(clone,1/hz));
   wheelTrack=extendWheelTrack(wheelTrack,clone.telemetry.wheelContacts||[]);
   const center=clone.pos.clone().add(clone.stats.com.clone().applyQuaternion(clone.q)),r=runwayApproach(center,clone.universalTime,'09',clone.vel);
   if(clone.telemetry.contacts)lastGround={along:-r.remaining,cross:r.crossTrack,time:clone.time};
   airborne=!clone.telemetry.contacts&&clone.orbit.altitude>10?airborne+1/hz:0;
   if(airborne>=1)return {status:'airborne',lastGround,wheelTrack,elapsedMs:performance.now()-begin};
  }
  return {status:clone.crashed?'crashed':'unresolved',lastGround,wheelTrack,elapsedMs:performance.now()-begin};
 }finally{clone.dispose();}
}
