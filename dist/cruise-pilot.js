// Cruise guidance using the existing actuators. Takeoff and landing are separate modes.
// Uses the existing SAS and throttle; never changes physical pose or velocity.
import * as T from 'three';
import {bodyUp,bodyAltitude,bodyGravity,referenceBody} from './celestial.js';
import {compassFrame,compassHeading} from './navigation.js';
import {surfaceRelativeVelocity} from './surface-frame.js';
import {atmosphere} from './planet.js';
import {PARTS} from './catalog.js';
import {controlDeflection} from './aero.js';
import {fuelNetworks,engineMaxThrust} from './resources.js';
const clamp=T.MathUtils.clamp,rad=Math.PI/180;
export function cruiseSettings(value){
 if(!value||!['altitude','vertical'].includes(value.mode??'altitude')||!['speed','altitude','heading'].every(k=>Number.isFinite(value[k]))||value.speed<40||value.speed>350||value.altitude<300||value.altitude>15000||value.heading<0||value.heading>=360||!Number.isFinite(value.vertical??0)||Math.abs(value.vertical??0)>10)throw Error('巡航目標の範囲を確認してください');
 return {speed:value.speed,altitude:value.altitude,heading:value.heading,mode:value.mode??'altitude',vertical:value.vertical??0};
}
export function cruiseAuthority(f){
 if(!f||f.crashed||f.rocketAxes||!f.parts.some(p=>PARTS[p.type].aircraftControl))return '航空機の制御装置が必要';
 if(!['pitch','roll'].every(name=>f.parts.some(p=>PARTS[p.type].controlAxis&&Math.abs(controlDeflection(p,f.stats.com,{[name]:1}))>1e-6)))return '昇降舵・補助翼の制御が必要';
 return null;
}
export function cruiseReadiness(f){
 const authority=cruiseAuthority(f);if(authority)return authority;
 const up=bodyUp(f.pos,f.universalTime),forward=new T.Vector3(0,0,1).applyQuaternion(f.q),top=new T.Vector3(0,1,0).applyQuaternion(f.q);
 if(referenceBody(f.pos,f.universalTime).id!=='planet')return '大気圏内の巡航用';
 if(!f.started||f.telemetry.contacts||bodyAltitude(f.pos,f.universalTime)<300)return '離陸後、高度300 m以上で開始';
 const v=surfaceRelativeVelocity(f.pos,f.vel,f.universalTime),vertical=v.dot(up),pitch=Math.asin(clamp(forward.dot(up),-1,1))/rad;
 if(v.length()<40||Math.abs(vertical)>15||top.dot(up)<.75||pitch < -10||pitch>30)return '姿勢と昇降率を安定させてください';
 return cruisePropulsion(f);
}
export function cruisePropulsion(f){
 if(!fuelNetworks(f.parts).groups.some(g=>g.tanks.some(p=>(f.fuel.get(p.id)||0)>0)&&g.engines.some(p=>PARTS[p.type].air&&f.active.has(p.id)&&engineMaxThrust(p)>0)))return '点火済みの航空エンジンと燃料供給が必要';
 return null;
}
export class CruisePilot{
 constructor(f,settings={speed:90,altitude:1000,heading:90}){
  const {speed,altitude,heading,mode,vertical}=cruiseSettings(settings);
  if(!f.parts.length||!(f.stats.mass>0))throw Error('Empty aircraft');
  this.target={speed,altitude,heading,mode,vertical};this.owner=f.vesselId;this.running=true;this.status='捕捉中';this.duration=0;this.settled=0;
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
  const authority=cruiseAuthority(f)||cruisePropulsion(f);if(authority){this.stop(f,'fault');this.faultMessage=authority;return;}
  this.elapsed+=dt;if(this.elapsed<.1)return;const elapsed=Math.min(this.elapsed,.2);this.elapsed=0;
  const center=f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));
  const up=bodyUp(center,f.universalTime),frame=compassFrame(center,f.universalTime);
  if(!frame){this.stop(f,'fault');return;}
  const v=surfaceRelativeVelocity(center,f.vel,f.universalTime),speed=v.length(),vertical=v.dot(up);
  const height=bodyAltitude(center,f.universalTime),desiredVertical=this.target.mode==='vertical'?this.target.vertical:clamp((this.target.altitude-height)*.08,-5,5);
  try{cruiseSettings(this.target);}catch{this.stop(f,'fault');return;}
  if(![height,speed,vertical].every(Number.isFinite)){this.stop(f,'fault');return;}
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
  this.duration+=elapsed;
  const verticalReady=this.target.mode==='vertical'?Math.abs(error)<.5:Math.abs(this.target.altitude-height)<10&&Math.abs(vertical)<.5;
  this.settled=verticalReady&&Math.abs(speedError)<2&&Math.abs(headingError)<2?this.settled+elapsed:0;
  this.status=this.settled>=3?'保持':this.duration>60?'目標未達':'捕捉中';
 }
}
