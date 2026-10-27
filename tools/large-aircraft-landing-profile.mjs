// Diagnostic only: normal runway departure, straight field approach, no state teleport.
// Compare approach energy and input cadence; this is not a runway-return autopilot.
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {surfaceRelativeVelocity} from '../dist/surface-frame.js';
for(const epoch of [0,160799.2])for(const profile of [
 {flareHeight:60,flareThrottle:.55,cadence:1},
 {flareHeight:150,flareThrottle:.85,cadence:1},
 {flareHeight:150,flareThrottle:.85,cadence:60},
])for(const descentThrottle of [.25,.4,.55]){
 const f=new Flight(preset('plane-large'),'runway',epoch);f.stageNext();f.throttle=1;
 let phase='climb',peak=0,touch=null,heldPitch=0;
 try{
  for(let i=0;i<240*120&&!f.crashed&&!f.landed;i++){
   const t=i/120,h=f.orbit?.altitude??0,vs=f.orbit?.vertical??0;
   let pitch=t>=10&&t<26?-1:0;
   if(t>=50&&phase==='climb'){phase='descend';f.throttle=descentThrottle;}
   if(phase==='descend'&&t<50.5)pitch=1;
   if(phase==='descend'&&h<profile.flareHeight&&vs<0)phase='flare';
   if(phase==='flare'){pitch=vs < -2?-1:0;f.throttle=h<8?0:profile.flareThrottle;}
   // Only elevator sampling is varied; throttle/phase checks remain per physics step.
   if(i%profile.cadence===0)heldPitch=pitch;
   f.step(1/120,{pitch:heldPitch});peak=Math.max(peak,f.orbit.altitude);
   if(phase==='flare'&&f.telemetry.contacts>0){
    touch={time:t,vertical:f.orbit.vertical,speed:surfaceRelativeVelocity(f.pos,f.vel,f.universalTime).length()};
    f.throttle=0;f.brake=true;phase='brake';
   }
  }
  console.log(JSON.stringify({epoch,...profile,descentThrottle,peak,touch,landed:f.landed,crashed:f.crashed,parts:f.parts.length,altitude:f.orbit.altitude,speed:surfaceRelativeVelocity(f.pos,f.vel,f.universalTime).length()}));
 }finally{f.dispose();}
}
