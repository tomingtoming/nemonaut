import * as T from 'three';
import {PRIMARY,bodyAltitude} from '../dist/celestial.js';
import {fixedToInertial,inertialToFixed,launchSiteOrientation,surfaceRelativeVelocity,surfaceOrientation} from '../dist/surface-frame.js';
import {compassHeading} from '../dist/navigation.js';
import {runwayApproach} from '../dist/runway-navigation.js';
import {CruisePilot,cruiseReadiness,cruiseTargetReadiness} from '../dist/cruise-pilot.js';
import {TakeoffPrototype} from './takeoff-prototype.mjs';
import {landingReadiness} from './landing-session.mjs';
import {planReturnRoute,routePoint} from './return-route.mjs';
import {rollServo} from './roll-servo.mjs';

// Initial runway-09 return envelope; no terrain/obstacle avoidance.
export function returnReadiness(f,speed=90){
 const problem=cruiseReadiness(f);if(problem)return problem;
 const h=bodyAltitude(f.pos,f.universalTime),r=runwayApproach(f.pos,f.universalTime);
 if(h>1500||!r||r.distance>40000)return '高度300〜1500 m・滑走路から40 km以内で帰投してください';
 return cruiseTargetReadiness(f,{speed,altitude:350,heading:90,mode:'altitude'});
}
export class ReturnPilot{
 constructor(f,{speed=90}={}){
  const problem=returnReadiness(f,speed);if(problem)throw Error(problem);
  this.owner=f;this.previous={sas:f.sas,sasMode:f.sasMode,trim:f.trim};this.phase='return';this.running=true;
  this.orientation=launchSiteOrientation('runway');this.inverse=this.orientation.clone().invert();
  const center=f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));
  const local=inertialToFixed(center,f.universalTime).applyQuaternion(this.inverse);
  const v=surfaceRelativeVelocity(center,f.vel,f.universalTime).applyQuaternion(surfaceOrientation(f.universalTime).invert()).applyQuaternion(this.inverse);
  const radius=Math.max(2500,Math.max(speed,v.length())**2/(9.81*Math.tan(15*Math.PI/180)));
  // Allow at least 5 m/s descent plus capture reserve; still experimental.
  const minLength=Math.max(18000,(Math.max(0,bodyAltitude(center,f.universalTime)-350)/5+30)*speed);
  this.route=planReturnRoute({x:local.x,y:local.z,heading:Math.atan2(v.z,v.x)},{x:0,y:-9000,heading:Math.PI/2},{radius,minLength});
  this.progress=0;this.maxRouteError=0;this.elapsed=0;
  this.driver=new TakeoffPrototype(f,{speed,altitude:350,rotation:12,integral:true,handoff:'attitude'});
  this.driver.cruise=new CruisePilot(f,{speed,altitude:350,heading:compassHeading(new T.Vector3(0,0,1).applyQuaternion(f.q),center,f.universalTime)});
 }
 stop(reason='manual'){
  if(!this.running)return;
  this.running=false;this.reason=reason;this.phase=reason==='fault'?'failed':'stopped';
  Object.assign(this.owner,this.previous);this.owner.holdQ=this.owner.q.clone();
  if(reason==='fault')this.owner.throttle=0;
 }
 update(f,dt,{manual=false}={}){
  if(!this.running)return {};
  if(f!==this.owner||manual){this.stop(manual?'manual':'vessel changed');return {};}
  if(f.crashed||!Number.isFinite(dt)||dt<0){this.stop('fault');return {};}
  if(dt===0)return {};
  this.elapsed+=dt;
  const center=f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));
  const local=inertialToFixed(center,f.universalTime).applyQuaternion(this.inverse),r=runwayApproach(center,f.universalTime,'09',f.vel);
  let nearest=this.progress,error=Infinity;
  for(let d=Math.max(0,this.progress-100);d<=Math.min(this.route.length,this.progress+1000);d+=25){
   const p=routePoint(this.route,d),e=Math.hypot(p.x-local.x,p.y-local.z);
   if(e<error){error=e;nearest=d;}
  }
  this.progress=Math.max(this.progress,nearest);this.maxRouteError=Math.max(this.maxRouteError,error);
  if(!r||!Number.isFinite(error)||error>2000||this.elapsed>1200||f.telemetry.contacts){this.faultMessage='帰投経路を維持できません';this.stop('fault');return {};}
  const nearEnd=this.progress>this.route.length-1200;
  const aim=routePoint(this.route,Math.min(this.route.length,this.progress+800));
  const target=fixedToInertial(new T.Vector3(aim.x,PRIMARY.radius,aim.y).normalize().multiplyScalar(PRIMARY.radius+350).applyQuaternion(this.orientation),f.universalTime);
  this.driver.cruise.target.heading=nearEnd?90-Math.atan2(r.crossTrack,1500)*180/Math.PI:compassHeading(target.sub(center),center,f.universalTime);
  this.phase=nearEnd&&!landingReadiness(f)?'capture':'return';
  // Reaching the end without an accepted landing handoff must not turn back
  // towards a waypoint behind the aircraft.
  if(nearEnd&&r.remaining<5000){this.faultMessage='着陸準備の範囲を通過しました';this.stop('fault');return {};}
  const commands=this.driver.update(f,dt);
  if(!this.driver.cruise.running){this.faultMessage=this.driver.cruise.faultMessage;this.stop('fault');return {};}
  if(this.driver.attitudeTarget){this.driver.lateralBias.z=0;commands.roll=rollServo(f,this.driver.attitudeTarget,12);}
  this.telemetry={...this.driver.cruise.telemetry,remaining:r.remaining,cross:r.crossTrack,progress:this.progress,length:this.route.length,error};
  return commands;
 }
}
