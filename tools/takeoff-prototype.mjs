// Experimental guidance: normal runway start, actuator commands only.
import * as T from 'three';
import {bodyUp,bodyAltitude,bodyGravity} from '../dist/celestial.js';
import {surfaceRelativeVelocity,surfaceAngularVelocity} from '../dist/surface-frame.js';
import {atmosphere} from '../dist/planet.js';
import {compassHeading} from '../dist/navigation.js';
import {CruisePilot,cruiseReadiness,cruiseTargetReadiness} from '../dist/cruise-pilot.js';
const rad=Math.PI/180,clamp=T.MathUtils.clamp;
export class TakeoffPrototype{
 constructor(f,{speed,altitude=600,rotation=8}){this.rotation=rotation;this.owner=f.vesselId;this.target={speed,altitude,heading:compassHeading(new T.Vector3(0,0,1).applyQuaternion(f.q),f.pos,f.universalTime)};this.phase='roll';this.elapsed=0;this.commands={};this.cruise=null;}
 update(f,dt){
  if(f.vesselId!==this.owner||f.crashed||!Number.isFinite(dt)||dt<0){this.phase='stopped';return {};}
  if(dt===0||this.phase==='stopped')return {};
  if(this.cruise){this.cruise.update(f,dt);return {};}
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
    this.telemetry={height,speed,vertical,pitch,targetPitch,minimum};this.cruise=new CruisePilot(f,this.target);this.phase='cruise';this.cruise.update(f,dt);return {};
   }
  }
  f.sas=false;f.trim=0;f.brake=false;f.throttle=this.phase==='capture'?clamp(.5+(this.target.speed-speed)*.03,.1,1):1;
  this.commands={pitch:clamp((pitch-targetPitch)*.2+pitchRate*.12,-1,1)};
  this.telemetry={height,speed,vertical,pitch,pitchRate,alpha:pitch-Math.asin(clamp(vertical/Math.max(speed,.001),-1,1))/rad,targetPitch,minimum,pitchCommand:this.commands.pitch,contacts:f.telemetry.contacts};return this.commands;
 }
}
