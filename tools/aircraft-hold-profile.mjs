// Controlled airborne initial conditions, not proof of normal takeoff or UI use.
import * as T from 'three';
import {Flight} from '../dist/core.js';import {preset} from '../dist/catalog.js';
import {bodyUp,bodyAltitude} from '../dist/celestial.js';
import {surfaceVelocity} from '../dist/surface-frame.js';
import {AircraftHoldPrototype} from './aircraft-hold-prototype.mjs';
import {cruiseReadiness} from '../dist/cruise-pilot.js';
import {PARTS} from '../dist/catalog.js';import {surfaceForce,partRotation,aeroPoint} from '../dist/aero.js';
import {atmosphere} from '../dist/planet.js';import {surfaceRelativeVelocity,surfaceAngularVelocity} from '../dist/surface-frame.js';
const normalDeparture=process.argv.includes('--departure');
const fuelFraction=Number(process.argv.find(s=>s.startsWith('--fuel='))?.split('=')[1]??1);
if(!Number.isFinite(fuelFraction)||fuelFraction<=0||fuelFraction>1)throw Error('Fuel fraction must be in (0, 1]');
const requested=process.argv.slice(2).find(s=>!s.startsWith('--'));
for(const kind of requested?[requested]:['plane','plane-large','transport-cargo']){
 const craft=preset(kind);if(!craft.length)throw Error('Unknown preset '+kind);
 const speed=kind==='plane'?120:90;
 const f=new Flight(craft,'runway',161700);f.stageNext();f.throttle=.5;
 for(const [id,amount] of f.fuel)f.fuel.set(id,amount*fuelFraction);
 if(normalDeparture){
  f.throttle=1;
  let command=0;
  for(let i=0;i<65*120&&!f.crashed;i++){
   const t=i/120;let pitch=t>10&&t<28?-1:0;
   if(kind==='transport-cargo'){
    pitch=0;if(t>=15){f.sas=false;
     if(i%12===0){const angle=Math.asin(new T.Vector3(0,0,1).applyQuaternion(f.q).dot(bodyUp(f.pos,f.universalTime)))*180/Math.PI,rate=-f.omega.clone().applyQuaternion(f.q.clone().invert()).x*180/Math.PI;command=T.MathUtils.clamp((angle-15)*.2+rate*.12,-1,1);}
     pitch=command;
    }
   }
   f.step(1/120,{pitch});
  }
  if(f.crashed||f.telemetry.contacts||f.orbit.altitude<100)throw Error('Departure failed '+kind);
 }else{
 const up=bodyUp(f.pos,f.universalTime),forward=new T.Vector3(0,0,1).applyQuaternion(f.q);
 f.q.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-6*Math.PI/180));f.holdQ=f.q.clone();
 f.pos.addScaledVector(up,1000-bodyAltitude(f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),f.universalTime));
 f.vel.copy(surfaceVelocity(f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),f.universalTime)).addScaledVector(forward,speed);
 }
 const targetHeight=normalDeparture?f.orbit.altitude:1000;
 const pilot=new AircraftHoldPrototype(f,{speed,altitude:targetHeight,heading:90});let stall=0,minHeight=Infinity,maxHeight=-Infinity;const stalledParts=new Map();
 console.log(JSON.stringify({kind,normalDeparture,fuelFraction,startRejection:cruiseReadiness(f),targetHeight,targetSpeed:speed,initialPitch:Math.asin(new T.Vector3(0,0,1).applyQuaternion(f.q).dot(bodyUp(f.pos,f.universalTime)))*180/Math.PI}));
 try{for(let i=0;i<180*120&&!f.crashed;i++){
  if(i===90*120)pilot.target.heading=110;
  pilot.update(f,1/120);f.step(1/120);stall=Math.max(stall,f.telemetry.stallCount??0);minHeight=Math.min(minHeight,f.orbit.altitude);maxHeight=Math.max(maxHeight,f.orbit.altitude);
  if(i%12===0){
   const com=f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),velocity=surfaceRelativeVelocity(com,f.vel,f.universalTime),omega=f.omega.clone().sub(surfaceAngularVelocity()),density=atmosphere(f.orbit.altitude).density;
   for(const p of f.parts.filter(p=>PARTS[p.type].wing)){
    const local=velocity.clone().add(omega.clone().cross(aeroPoint(p).applyQuaternion(f.q).add(f.pos).sub(com)));
    const a=surfaceForce(p,f.q.clone().multiply(partRotation(p)),local,density,f.deflections.get(p.id)||0);
    if(a.stalled){const old=stalledParts.get(p.type)||{samples:0,maxAlpha:0};old.samples++;old.maxAlpha=Math.max(old.maxAlpha,Math.abs(a.alpha)*180/Math.PI);stalledParts.set(p.type,old);}
   }
  }
  if(i% (30*120)===0||(i<10*120&&i%120===0)){
   const actualPitch=Math.asin(new T.Vector3(0,0,1).applyQuaternion(f.q).dot(bodyUp(f.pos,f.universalTime)))*180/Math.PI;
   const upwardAcceleration=f.telemetry.force.dot(bodyUp(f.pos,f.universalTime))/f.stats.mass;
   const surfaces=f.parts.filter(p=>PARTS[p.type].controlAxis==='pitch').map(p=>({type:p.type,degrees:(f.deflections.get(p.id)||0)*180/Math.PI}));
   console.log(JSON.stringify({kind,t:i/120,...pilot.telemetry,actualPitch,upwardAcceleration,surfaces,pitchCommand:f.telemetry.commands.pitch,stall,crashed:f.crashed}));
  }
 }console.log(JSON.stringify({kind,final:pilot.telemetry,minHeight,maxHeight,stalledParts:Object.fromEntries(stalledParts),crashed:f.crashed,reason:pilot.reason}));}finally{f.dispose();}
}
