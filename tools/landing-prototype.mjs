// Experimental guidance. Commands actuators only; not connected to product UI.
import * as T from 'three';
import {bodyUp,bodyAltitude,bodyGravity} from '../dist/celestial.js';
import {surfaceRelativeVelocity,surfaceAngularVelocity} from '../dist/surface-frame.js';
import {compassFrame,compassHeading} from '../dist/navigation.js';
import {runwayApproach,RUNWAY} from '../dist/runway-navigation.js';
import {atmosphere} from '../dist/planet.js';
import {PARTS} from '../dist/catalog.js';
import {partCenter} from '../dist/aero.js';
import {TakeoffPrototype} from './takeoff-prototype.mjs';
import {extendWheelTrack} from '../dist/runway-wheel-track.js';
import {RolloutControl} from './rollout-control.mjs';
import {rollServo} from './roll-servo.mjs';
import {planLandingTrim} from './landing-trim.mjs';
import {landingPlanMatches,landingPlanCurrent} from './landing-plan-client.mjs';
const rad=Math.PI/180,clamp=T.MathUtils.clamp;
export class LandingPrototype{
 constructor(f,{rolloutControl=true,rollIntegral=false,lateralMode='acceleration',lateralTime=8,rollGain=12,speedFloor=90,approachAlpha=8,useTrimPlan=true,preparedPlan,preparedContext}={}){this.approachAlpha=approachAlpha;this.speedFloor=speedFloor;this.rollGain=rollGain;this.lateralTime=lateralTime;this.lateralMode=lateralMode;this.rollIntegral=rollIntegral;this.owner=f.vesselId;this.phase='approach';this.elapsed=1;this.powerBias=f.throttle;this.verticalBias=0;
  this.rolloutControl=rolloutControl?new RolloutControl():null;
  this.inner=new TakeoffPrototype(f,{speed:90,integral:true,handoff:'attitude'});this.inner.cruise={running:true,telemetry:{pitch:0}};
  if(useTrimPlan){
   const center=f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));
   if(preparedPlan!==undefined){
    if(!preparedContext||!landingPlanMatches(preparedPlan,preparedContext)||!landingPlanCurrent(f,preparedContext))throw Error('Landing plan no longer applies');
    this.trimPlan=structuredClone(preparedPlan);
   }else this.trimPlan=planLandingTrim(f,{density:atmosphere(bodyAltitude(center,f.universalTime)).density,gravity:bodyGravity(center,f.universalTime).length()});
   this.commandedSpeed=surfaceRelativeVelocity(center,f.vel,f.universalTime).length();
   if(!this.trimPlan){this.phase='failed';this.reason='no longitudinal trim in search range';}
  }
 }
 update(f,dt){
  if(f.vesselId!==this.owner||f.crashed||!Number.isFinite(dt)||dt<0){this.phase='failed';return {};}
  if(dt===0||['stopped','failed'].includes(this.phase))return {};
  const center=f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),up=bodyUp(center,f.universalTime);
  const h=bodyAltitude(center,f.universalTime),v=surfaceRelativeVelocity(center,f.vel,f.universalTime),speed=v.length(),vs=v.dot(up);
  const r=runwayApproach(center,f.universalTime,'09',f.vel),heading=compassHeading(new T.Vector3(0,0,1).applyQuaternion(f.q),center,f.universalTime);
  const headingError=((90-heading+540)%360)-180;
  const groundHeight=Math.max(...f.parts.filter(p=>PARTS[p.type].wheel).map(p=>PARTS[p.type].size[1]/2-partCenter(p).y+f.stats.com.y))+.12;
  const agl=h-groundHeight;
  const wheelHalfSpan=Math.max(...f.parts.filter(p=>PARTS[p.type].wheel).map(p=>Math.abs(partCenter(p).x-f.stats.com.x)+PARTS[p.type].size[0]/2));
  this.track=extendWheelTrack(this.track,f.telemetry.wheelContacts||[]);
  if(f.telemetry.contacts&&agl<5&&this.phase!=='go-around')this.phase='rollout';
  if(this.phase==='rollout'){
   f.throttle=0;f.brake=true;f.sas=false;f.trim=0;
   if(speed<.5&&f.landed){
    const inside=this.track&&this.track.minAlong>=0&&this.track.maxAlong<=RUNWAY.length&&this.track.maxCross<=RUNWAY.width/2;
    this.phase=inside?'stopped':'failed';if(!inside)this.reason='off-runway touchdown';
   }
   this.telemetry={h,agl,speed,vs,remaining:r.remaining,cross:r.crossTrack,heading};
   const angular=f.omega.clone().sub(surfaceAngularVelocity()).applyQuaternion(f.q.clone().invert());
   const control=this.rolloutControl?.step({speed,pitchRate:-angular.x/rad,remaining:RUNWAY.length+r.remaining},dt);
   if(control&&this.phase==='rollout')f.brake=control.brake;
   const yawRate=angular.y;
   return {pitch:control?.pitch??0,roll:0,yaw:clamp(-headingError*.05+r.crossTrack*.03-yawRate*1.5,-1,1)};
  }
  const actualPitch=Math.asin(clamp(new T.Vector3(0,0,1).applyQuaternion(f.q).dot(up),-1,1))/rad;
  const pitchShortfall=(this.inner.cruise.telemetry.pitch??actualPitch)-actualPitch;
  const lostVerticalControl=vs<-8&&(f.telemetry.commands?.pitch??0)<-.95&&pitchShortfall>3;
  this.sinkDuration=lostVerticalControl?(this.sinkDuration??0)+dt:0;
  if(this.phase==='approach'){
   const reasons=[];
   // Loss of vertical control can occur before reaching the final corridor.
   if(this.sinkDuration>2||(agl<100&&r.remaining<2000&&vs<-8))reasons.push('sink-rate');
   if(agl<100&&r.remaining<2000){
   if(Math.abs(r.crossTrack)>40)reasons.push('cross-track');
   if(Math.abs(headingError)>15)reasons.push('heading');
   if(agl<30&&Math.abs(r.crossTrack)+wheelHalfSpan>RUNWAY.width/2)reasons.push('wheel-clearance');
   if(r.remaining<-(RUNWAY.length-speed*speed/12-150))reasons.push('stopping-distance');
   }
   if(reasons.length){this.phase='go-around';this.reason='unstable final';this.abort={reasons,time:f.time,agl,speed,vs,pitchShortfall,controlLossDuration:this.sinkDuration,cross:r.crossTrack,remaining:r.remaining,heading};}
  }
  this.elapsed+=dt;
  if(this.elapsed>=.1){
   const elapsed=this.elapsed;this.elapsed=0;
   const density=atmosphere(h).density,g=bodyGravity(center,f.universalTime).length(),area=f.stats.aero.weight;
   // The lift-only/fixed-floor branch remains for reproducing earlier trials.
   // The trim plan is prepared before control starts, not inside the fast loop.
   const selectedSpeed=this.trimPlan?.speed??Math.max(this.speedFloor,Math.sqrt(2*f.stats.mass*g/(density*area*4.5*this.approachAlpha*rad)));
   if(this.trimPlan)this.commandedSpeed+=clamp(selectedSpeed-this.commandedSpeed,-.5*elapsed,.5*elapsed);
   const approachSpeed=this.trimPlan?this.commandedSpeed:selectedSpeed;
   const desiredHeight=groundHeight+Math.max(0,(r.remaining+180)*Math.tan(3*rad));
   const sink=agl<8?-clamp(agl*.3,1,3):clamp(-speed*Math.tan(3*rad)+(desiredHeight-h)*.08,-6,3);
   const targetVs=this.phase==='go-around'?5:sink,error=targetVs-vs;
   this.verticalBias=clamp(this.verticalBias+error*.04*elapsed,-6,6);
   const lift=f.stats.mass*g/(.5*density*speed*speed*area*4.5);
   const pitch=clamp(lift/rad+Math.asin(clamp(targetVs/Math.max(speed,1),-.5,.5))/rad+this.verticalBias+error*.4,-8,15);
   const targetHeading=90-clamp(Math.atan2(r.crossTrack+(r.track?.x??0)*8,Math.max(500,speed*8))/rad,-30,30);
   const turn=((targetHeading-heading+540)%360)-180;
   const crossRate=r.track?.x??0,alongRate=-(r.track?.y??-speed);
   const course=90+Math.atan2(crossRate,Math.max(alongRate,1))/rad;
   // Experimental damped cross-track acceleration; yaw follows velocity to
   // avoid demanding a skid while the bank supplies the lateral acceleration.
   const acceleration=-r.crossTrack/(this.lateralTime*this.lateralTime)-2*crossRate/this.lateralTime;
   const bank=this.lateralMode==='acceleration'?clamp(Math.atan2(acceleration,g),-20*rad,20*rad):clamp(turn*.7,-20,20)*rad;
   const yawError=this.lateralMode==='acceleration'?((course-heading+540)%360)-180:turn;
   const frame=compassFrame(center,f.universalTime),yaw=(heading+clamp(yawError,-5,5))*rad;
   const forward=frame.north.clone().multiplyScalar(Math.cos(yaw)).addScaledVector(frame.east,Math.sin(yaw)),right=up.clone().cross(forward).normalize();
   forward.multiplyScalar(Math.cos(pitch*rad)).addScaledVector(up,Math.sin(pitch*rad));
   f.holdQ=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(right,forward.clone().cross(right).normalize(),forward)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),bank));
   this.inner.cruise.telemetry={pitch};
   this.powerBias=clamp(this.powerBias+(approachSpeed-speed)*.005*elapsed,0,1);
   f.throttle=this.phase==='go-around'?1:clamp(this.powerBias+(approachSpeed-speed)*.025,0,1);f.brake=false;f.trim=0;
   this.telemetry={h,agl,speed,vs,remaining:r.remaining,cross:r.crossTrack,crossRate,heading,course,targetHeading,targetBank:bank/rad,pitch,approachSpeed,targetVs,desiredHeight};
  }
  // Retained roll trim caused overshoot during reversing final-approach demands.
  // Keep the comparison available; pitch/yaw trim and the product servo are unchanged.
  if(!this.rollIntegral&&this.inner.lateralBias)this.inner.lateralBias.z=0;
  const commands=this.inner.cruiseCommands(f,dt);
  if(this.rollGain!==4)commands.roll=rollServo(f,this.inner.attitudeTarget,this.rollGain);
  return commands;
 }
}
