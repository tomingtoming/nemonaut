// Experimental guidance: normal runway start, actuator commands only.
import * as T from 'three';
import {bodyUp,bodyAltitude,bodyGravity} from '../dist/celestial.js';
import {surfaceRelativeVelocity,surfaceAngularVelocity} from '../dist/surface-frame.js';
import {atmosphere} from '../dist/planet.js';
import {compassHeading} from '../dist/navigation.js';
import {CruisePilot,cruiseReadiness,cruiseTargetReadiness} from '../dist/cruise-pilot.js';
const rad=Math.PI/180,clamp=T.MathUtils.clamp;
export class TakeoffPrototype{
 constructor(f,{speed,altitude=600,rotation=8,integral=false,handoff='direct'}){this.handoffMode=handoff;this.integral=integral;this.pitchBias=0;this.rotation=rotation;this.owner=f.vesselId;this.target={speed,altitude,heading:compassHeading(new T.Vector3(0,0,1).applyQuaternion(f.q),f.pos,f.universalTime)};this.phase='roll';this.elapsed=0;this.commands={};this.cruise=null;}
 update(f,dt){
  if(f.vesselId!==this.owner||f.crashed||!Number.isFinite(dt)||dt<0){this.phase='stopped';return {};}
  if(dt===0||this.phase==='stopped')return {};
  if(this.cruise){if(['ramp','servo'].includes(this.handoffMode))this.cruise.target.speed+=clamp(this.target.speed-this.cruise.target.speed,-.5*dt,.5*dt);this.cruise.update(f,dt);return this.handoffMode==='servo'?this.pitchServo(f,this.cruise.telemetry.pitch,dt):{};}
  // Fast attitude feedback must observe each physics step; holding saturated
  // control for 100 ms caused a limit cycle on the light aircraft.
  const center=f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),up=bodyUp(center,f.universalTime),v=surfaceRelativeVelocity(center,f.vel,f.universalTime);
  const height=bodyAltitude(center,f.universalTime),speed=v.length(),vertical=v.dot(up),density=atmosphere(height).density;
  const minimum=Math.sqrt(2*f.stats.mass*bodyGravity(center,f.universalTime).length()/(density*f.stats.aero.weight*4.5*12*rad));
  const pitch=Math.asin(clamp(new T.Vector3(0,0,1).applyQuaternion(f.q).dot(up),-1,1))/rad;
  const omega=f.omega.clone().sub(surfaceAngularVelocity()).applyQuaternion(f.q.clone().invert()),pitchRate=-omega.x/rad;
  if(this.phase==='roll'&&speed>minimum*.95)this.phase='rotate';
  if(this.phase==='rotate'&&height>30&&!f.telemetry.contacts)this.phase='climb';
  if(this.phase==='climb'&&height>this.target.altitude-100)this.phase='capture';
  let targetPitch=this.phase==='roll'?0:this.phase==='rotate'?this.rotation:12;
  if(this.phase==='capture'){
   const lift=f.stats.mass*bodyGravity(center,f.universalTime).length()/(.5*density*speed*speed*f.stats.aero.weight*4.5)/rad;
   targetPitch=clamp(lift+(clamp((this.target.altitude-height)*.05,-3,5)-vertical)*.4,-5,12);
   if(height>300&&Math.abs(vertical)<5&&Math.abs(pitch)<15&&!cruiseReadiness(f)&&!cruiseTargetReadiness(f,this.target)){
    const beforeThrottle=f.throttle;
    this.cruise=new CruisePilot(f,{...this.target,speed:['ramp','servo'].includes(this.handoffMode)?speed:this.target.speed});
    if(this.handoffMode!=='direct')this.cruise.powerBias=clamp(beforeThrottle-(this.cruise.target.speed-speed)*.025,0,1);
    this.phase='cruise';this.cruise.update(f,dt);
    this.telemetry={height,speed,vertical,pitch,targetPitch,minimum,beforeThrottle,afterThrottle:f.throttle,handoffMode:this.handoffMode};return this.handoffMode==='servo'?this.pitchServo(f,this.cruise.telemetry.pitch,dt):{};
   }
  }
  f.sas=false;f.trim=0;f.brake=false;f.throttle=this.phase==='capture'?clamp(.5+(this.target.speed-speed)*.03,.1,1):1;
  const error=pitch-targetPitch,raw=error*.2+pitchRate*.12+this.pitchBias;
  if(this.integral&&(Math.abs(raw)<1||error*raw<0))this.pitchBias=clamp(this.pitchBias+error*.08*dt,-.6,.6);
  this.commands={pitch:clamp(error*.2+pitchRate*.12+this.pitchBias,-1,1)};
  this.telemetry={height,speed,vertical,pitch,pitchRate,alpha:pitch-Math.asin(clamp(vertical/Math.max(speed,.001),-1,1))/rad,targetPitch,minimum,pitchCommand:this.commands.pitch,contacts:f.telemetry.contacts};return this.commands;
 }
 // Diagnostic straight-flight comparison only: retain the takeoff elevator
 // controller while consuming the cruise guidance. No heading/bank control.
 pitchServo(f,targetPitch,dt){
  const center=f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),up=bodyUp(center,f.universalTime);
  const pitch=Math.asin(clamp(new T.Vector3(0,0,1).applyQuaternion(f.q).dot(up),-1,1))/rad;
  const rate=-f.omega.clone().sub(surfaceAngularVelocity()).applyQuaternion(f.q.clone().invert()).x/rad,error=pitch-targetPitch;
  const raw=error*.2+rate*.12+this.pitchBias;
  if(this.integral&&(Math.abs(raw)<1||error*raw<0))this.pitchBias=clamp(this.pitchBias+error*.08*dt,-.6,.6);
  f.sas=false;return {pitch:clamp(error*.2+rate*.12+this.pitchBias,-1,1)};
 }
}
