import * as T from 'three';
import {CruisePilot,cruiseReadiness,cruiseTargetReadiness,cruiseAuthority,cruisePropulsion} from '../dist/cruise-pilot.js';
import {bodyAltitude,bodyUp,referenceBody} from '../dist/celestial.js';
import {surfaceRelativeVelocity} from '../dist/surface-frame.js';
import {compassHeading} from '../dist/navigation.js';
import {runwayApproach} from '../dist/runway-navigation.js';
import {PARTS} from '../dist/catalog.js';
import {landingPlanCurrent,landingPlanMatches} from './landing-plan-client.mjs';
import {LandingPrototype} from './landing-prototype.mjs';

// Initial capture envelope, based on the approach and normal-return trials.
// This is not a route planner from arbitrary positions or a landing guarantee.
export function landingReadiness(f,end='09'){
 if(!['09','27'].includes(end))return '着陸方向を選択してください';
 const problem=cruiseAuthority(f)||cruisePropulsion(f);if(problem)return problem;
 if(!f.parts.some(p=>PARTS[p.type].wheel))return '着陸用の車輪が必要';
 const center=f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));
 if(referenceBody(center,f.universalTime).id!=='planet'||f.telemetry.contacts)return `母星の滑走路${end}へ飛行中に準備してください`;
 const h=bodyAltitude(center,f.universalTime),up=bodyUp(center,f.universalTime),v=surfaceRelativeVelocity(center,f.vel,f.universalTime);
 const r=runwayApproach(center,f.universalTime,end,f.vel),heading=compassHeading(new T.Vector3(0,0,1).applyQuaternion(f.q),center,f.universalTime);
 if(!r||![h,heading,r.remaining,r.crossTrack,v.length(),v.dot(up)].every(Number.isFinite)||h<300||h>400||r.remaining<5000||r.remaining>10000||Math.abs(r.crossTrack)>250||Math.abs(((heading-(end==='27'?270:90)+540)%360)-180)>15)return `${end}端の手前5〜10 km・高度300〜400 mで進入方向へ整列してください`;
 if(v.length()<40||v.length()>170||Math.abs(v.dot(up))>6||new T.Vector3(0,1,0).applyQuaternion(f.q).dot(up)<.94)return '速度・姿勢・昇降率を安定させてください';
 return null;
}

export class LandingSession{
 constructor(client){this.client=client;this.generation=0;this.state='idle';this.prepared=null;this.pilot=null;this.owner=null;}
 cancel(){this.generation++;this.client.cancel();this.prepared=null;if(!this.pilot)this.state='idle';}
 async prepare(f,{end='09'}={}){
  if(this.pilot)throw Error('着陸制御を停止してから再準備してください');
  this.cancel();const generation=this.generation,problem=landingReadiness(f,end);if(problem)throw Error(problem);
  this.state='planning';
  try{
   const result=await this.client.request(f);
   if(generation!==this.generation)return {status:'cancelled'};
   if(result.status!=='ready'){this.state=result.status==='unavailable'?'rejected':'idle';return result;}
   if(!result.context||!landingPlanMatches(result.plan,result.context)||!landingPlanCurrent(f,result.context)||landingReadiness(f,end)){this.state='idle';return {status:'stale'};}
   this.prepared={f,...result,end};this.state='ready';return result;
  }catch(error){if(generation!==this.generation)return {status:'cancelled'};this.state='idle';throw error;}
 }
 readyFor(f){
  if(this.state!=='ready'||!this.prepared)return false;
  const p=this.prepared,valid=p.f===f&&landingPlanCurrent(f,p.context)&&!landingReadiness(f,p.end);
  if(!valid)this.cancel();return valid;
 }
 start(f){
  if(!this.readyFor(f))throw Error('進入状態が変わりました。着陸を再準備してください');
  const p=this.prepared;
  const pilot=new LandingPrototype(f,{end:p.end,preparedPlan:p.plan,preparedContext:p.context});
  this.previous={sas:f.sas,sasMode:f.sasMode,trim:f.trim};this.owner=f;this.pilot=pilot;this.recovery=null;this.prepared=null;this.state='running';this.reason=null;this.faultMessage=null;
  return pilot;
 }
 stop(reason='manual'){
  this.cancel();const f=this.owner;
  if(f&&this.pilot){Object.assign(f,this.previous);f.holdQ=f.q.clone();if(reason==='fault'||reason==='landed')f.throttle=0;if(reason==='landed')f.brake=true;}
  this.pilot=null;this.recovery=null;this.owner=null;this.state=reason==='fault'?'failed':reason==='landed'?'landed':'idle';this.reason=reason;
 }
 goAround(f){
  if(f!==this.owner||!this.pilot||this.pilot.phase!=='approach')return false;
  this.pilot.phase='go-around';this.pilot.reason='requested';return true;
 }
 step(f,dt,{manual=false}={}){
  if(!this.pilot)return {};
  if(f!==this.owner||manual){this.stop(manual?'manual':'vessel changed');return {};}
  if(f.crashed||!Number.isFinite(dt)||dt<0){this.stop('fault');return {};}
  if(dt===0)return {};
  const problem=cruiseAuthority(f)||(this.pilot.phase==='rollout'?null:cruisePropulsion(f));
  if(problem){this.stop('fault');this.faultMessage=problem;return {};}
  if(this.pilot.phase==='go-around'&&!this.recovery){
   const center=f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));
   if(bodyAltitude(center,f.universalTime)>=450&&!cruiseReadiness(f)){
    const target={speed:Math.max(90,this.pilot.trimPlan?.speed??90),altitude:600,heading:compassHeading(new T.Vector3(0,0,1).applyQuaternion(f.q),center,f.universalTime),mode:'altitude',vertical:0};
    if(!cruiseTargetReadiness(f,target)){this.recovery=new CruisePilot(f,target);this.pilot.phase='recovery';}
   }
  }
  if(this.recovery){
   this.recovery.update(f,dt);this.telemetry=this.recovery.telemetry;
   if(!this.recovery.running){this.faultMessage=this.recovery.faultMessage;this.stop('fault');return {};}
   this.pilot.phase=this.recovery.status==='保持'?'recovery-hold':'recovery';return {};
  }
  const commands=this.pilot.update(f,dt);this.telemetry=this.pilot.telemetry;
  if(this.pilot.phase==='failed'){this.faultMessage=this.pilot.reason;this.stop('fault');return {};}
  if(this.pilot.phase==='stopped'){this.stop('landed');return {};}
  return commands;
 }
}
