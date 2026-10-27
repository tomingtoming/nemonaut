// Independent experimental guidance. Not connected to the product UI yet.
// Uses the existing SAS and throttle; never changes physical pose or velocity.
import * as T from 'three';
import {bodyUp,bodyAltitude,bodyGravity,referenceBody} from '../dist/celestial.js';
import {compassFrame,compassHeading} from '../dist/navigation.js';
import {surfaceRelativeVelocity} from '../dist/surface-frame.js';
import {atmosphere} from '../dist/planet.js';
const clamp=T.MathUtils.clamp,rad=Math.PI/180;
export class AircraftHoldPrototype{
 constructor(f,{speed=90,altitude=1000,heading=90}={}){
  if(![speed,altitude,heading].every(Number.isFinite)||speed<=0)throw Error('Invalid target');
  if(!f.parts.length||!(f.stats.mass>0))throw Error('Empty aircraft');
  this.target={speed,altitude,heading};this.owner=f.vesselId;this.running=true;
  this.previous={sas:f.sas,sasMode:f.sasMode,trim:f.trim};
  this.pitchBias=0;this.powerBias=f.throttle;this.elapsed=.1;
 }
 stop(f,reason='manual'){
  this.running=false;this.reason=reason;
  if(f.vesselId===this.owner){Object.assign(f,this.previous);f.holdQ=f.q.clone();if(reason==='fault')f.throttle=0;}
 }
 update(f,dt,{manual=false}={}){
  if(!this.running)return;
  if(f.vesselId!==this.owner){this.running=false;this.reason='vessel changed';return;}
  if(manual){this.stop(f);return;}
  if(!Number.isFinite(dt)||dt<0||f.crashed){this.stop(f,'fault');return;}
  if(dt===0)return;
  this.elapsed+=dt;if(this.elapsed<.1)return;const elapsed=Math.min(this.elapsed,.2);this.elapsed=0;
  const center=f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));
  const up=bodyUp(center,f.universalTime),frame=compassFrame(center,f.universalTime);
  if(!frame){this.stop(f,'fault');return;}
  const v=surfaceRelativeVelocity(center,f.vel,f.universalTime),speed=v.length(),vertical=v.dot(up);
  const height=bodyAltitude(center,f.universalTime),desiredVertical=clamp((this.target.altitude-height)*.08,-5,5);
  if(![height,speed,vertical,...Object.values(this.target)].every(Number.isFinite)){this.stop(f,'fault');return;}
  const error=desiredVertical-vertical;
  const currentHeading=compassHeading(new T.Vector3(0,0,1).applyQuaternion(f.q),center,f.universalTime);
  if(currentHeading===null){this.stop(f,'fault');return;}
  const headingError=((this.target.heading-currentHeading+540)%360)-180;
  const bank=clamp(headingError*.7,-20,20)*rad;
  // Feed forward the lift needed to carry current mass. This uses the game's
  // pre-stall lift slope and projected wing area, not a per-preset trim angle.
  // It is an estimate: tail trim, drag and thrust moments still need feedback.
  const density=referenceBody(center,f.universalTime).id==='planet'?atmosphere(height).density:0,area=f.stats.aero.weight;
  const liftSlope=.5*density*speed*speed*area*4.5;
  if(!(liftSlope>0)){this.stop(f,'fault');return;}
  const gravity=bodyGravity(center,f.universalTime).length();
  const liftAngle=f.stats.mass*gravity/(liftSlope*Math.cos(bank));
  this.pitchBias=clamp(this.pitchBias+error*.04*elapsed,-6,6);
  const pitch=clamp(liftAngle/rad+this.pitchBias+error*.4,-10,18)*rad;
  // Bound yaw demand to let a banked aircraft turn instead of commanding a snap yaw.
  const heading=(currentHeading+clamp(headingError,-5,5))*rad;
  const forward=frame.north.clone().multiplyScalar(Math.cos(heading)).addScaledVector(frame.east,Math.sin(heading));
  const right=up.clone().cross(forward).normalize();forward.multiplyScalar(Math.cos(pitch)).addScaledVector(up,Math.sin(pitch));
  const top=forward.clone().cross(right).normalize();
  f.holdQ=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(right,top,forward)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),bank));
  const speedError=this.target.speed-speed;
  this.powerBias=clamp(this.powerBias+speedError*.005*elapsed,0,1);
  f.throttle=clamp(this.powerBias+speedError*.025,0,1);f.sas=true;f.sasMode='hold';f.trim=0;
  this.telemetry={height,speed,vertical,heading:currentHeading,pitch:pitch/rad,bank:bank/rad,throttle:f.throttle,liftAngle:liftAngle/rad,liftMargin:12*rad/Math.max(liftAngle,.0001)};
 }
}
