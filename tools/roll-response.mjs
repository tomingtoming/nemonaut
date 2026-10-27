// Airborne diagnostic: measured actuator response, never a product autopilot.
import * as T from 'three';
import {landingFixture} from './landing-profile.mjs';
import {TakeoffPrototype} from './takeoff-prototype.mjs';
import {CruisePilot} from '../dist/cruise-pilot.js';
import {bodyUp} from '../dist/celestial.js';
import {surfaceAngularVelocity,surfaceRelativeVelocity} from '../dist/surface-frame.js';
import {compassFrame,compassHeading} from '../dist/navigation.js';
import {controlDeflection} from '../dist/aero.js';
import {rollServo} from './roll-servo.mjs';
const rad=Math.PI/180;
export function rollResponse({kind='transport-cargo',fuelLoad=.5,rollGain=4,log=()=>{}}={}){
 const f=landingFixture({kind,offset:0,fuelLoad}),inner=new TakeoffPrototype(f,{speed:90,integral:true,handoff:'attitude'});
 const cruise=new CruisePilot(f,{speed:100,altitude:350,heading:90});inner.cruise=cruise;
 const samples=[];
 try{
  for(let i=0;i<60*120&&!f.crashed;i++){
   const t=i/120,targetBank=t<20?0:t<35?10:t<50?-10:0;
   cruise.update(f,1/120);
   const center=f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),up=bodyUp(center,f.universalTime),frame=compassFrame(center,f.universalTime);
   const velocity=surfaceRelativeVelocity(center,f.vel,f.universalTime),course=compassHeading(velocity,center,f.universalTime)*rad;
   const pitch=(cruise.telemetry.pitch??0)*rad;
   const forward=frame.north.clone().multiplyScalar(Math.cos(course)).addScaledVector(frame.east,Math.sin(course)),right=up.clone().cross(forward).normalize();
   forward.multiplyScalar(Math.cos(pitch)).addScaledVector(up,Math.sin(pitch));
   f.holdQ=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(right,forward.clone().cross(right).normalize(),forward)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),targetBank*rad));
   // Refresh the diagnostic target every step; preserve the production servo.
   inner.guidanceSample=null;if(inner.lateralBias)inner.lateralBias.z=0;
   const commands=inner.cruiseCommands(f,1/120);
   commands.roll=rollServo(f,inner.attitudeTarget,rollGain);
   const localUp=up.clone().applyQuaternion(f.q.clone().invert()),bank=Math.atan2(localUp.x,localUp.y)/rad;
   const rate=f.omega.clone().sub(surfaceAngularVelocity()).applyQuaternion(f.q.clone().invert()).z/rad;
   const surfaces=f.parts.filter(p=>Math.abs(controlDeflection(p,f.stats.com,{roll:1}))>1e-8);
   if(i%30===0){const sample={kind,fuelLoad,t,targetBank,bank,rate,command:commands.roll,speed:velocity.length(),surfaces:surfaces.map(p=>({id:p.id,actual:(f.deflections.get(p.id)||0)/rad,requested:controlDeflection(p,f.stats.com,commands)/rad}))};samples.push(sample);log(sample);}
   f.step(1/120,commands);
  }
  return {kind,fuelLoad,rollGain,crashed:f.crashed,samples};
 }finally{f.dispose();}
}
if(process.argv[1]?.endsWith('roll-response.mjs'))rollResponse({kind:process.argv[2]??'transport-cargo',fuelLoad:Number(process.argv[3]??.5),log:r=>console.log(JSON.stringify(r))});
