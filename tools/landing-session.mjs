import * as T from 'three';
import {cruiseAuthority,cruisePropulsion} from '../dist/cruise-pilot.js';
import {bodyAltitude,bodyUp,referenceBody} from '../dist/celestial.js';
import {surfaceRelativeVelocity} from '../dist/surface-frame.js';
import {compassHeading} from '../dist/navigation.js';
import {runwayApproach} from '../dist/runway-navigation.js';
import {PARTS} from '../dist/catalog.js';
import {landingPlanCurrent,landingPlanMatches} from './landing-plan-client.mjs';
import {LandingPrototype} from './landing-prototype.mjs';

// Initial capture envelope, based on the approach and normal-return trials.
// This is not a route planner from arbitrary positions or a landing guarantee.
export function landingReadiness(f){
 const problem=cruiseAuthority(f)||cruisePropulsion(f);if(problem)return problem;
 if(!f.parts.some(p=>PARTS[p.type].wheel))return '着陸用の車輪が必要';
 const center=f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));
 if(referenceBody(center,f.universalTime).id!=='planet'||f.telemetry.contacts)return '母星の滑走路09へ飛行中に準備してください';
 const h=bodyAltitude(center,f.universalTime),up=bodyUp(center,f.universalTime),v=surfaceRelativeVelocity(center,f.vel,f.universalTime);
 const r=runwayApproach(center,f.universalTime,'09',f.vel),heading=compassHeading(new T.Vector3(0,0,1).applyQuaternion(f.q),center,f.universalTime);
 if(!r||![h,heading,r.remaining,r.crossTrack,v.length(),v.dot(up)].every(Number.isFinite)||h<300||h>400||r.remaining<5000||r.remaining>10000||Math.abs(r.crossTrack)>250||Math.abs(((heading-90+540)%360)-180)>15)return '09端の手前5〜10 km・高度300〜400 mで進入方向へ整列してください';
 if(v.length()<40||v.length()>170||Math.abs(v.dot(up))>6||new T.Vector3(0,1,0).applyQuaternion(f.q).dot(up)<.94)return '速度・姿勢・昇降率を安定させてください';
 return null;
}

export class LandingSession{
 constructor(client){this.client=client;this.generation=0;this.state='idle';this.prepared=null;this.pilot=null;this.owner=null;}
 cancel(){this.generation++;this.client.cancel();this.prepared=null;if(!this.pilot)this.state='idle';}
 async prepare(f){
  if(this.pilot)throw Error('着陸制御を停止してから再準備してください');
  this.cancel();const generation=this.generation,problem=landingReadiness(f);if(problem)throw Error(problem);
  this.state='planning';
  try{
   const result=await this.client.request(f);
   if(generation!==this.generation)return {status:'cancelled'};
   if(result.status!=='ready'){this.state=result.status==='unavailable'?'rejected':'idle';return result;}
   if(!result.context||!landingPlanMatches(result.plan,result.context)||!landingPlanCurrent(f,result.context)||landingReadiness(f)){this.state='idle';return {status:'stale'};}
   this.prepared={f,...result};this.state='ready';return result;
  }catch(error){if(generation!==this.generation)return {status:'cancelled'};this.state='idle';throw error;}
 }
 readyFor(f){
  if(this.state!=='ready'||!this.prepared)return false;
  const p=this.prepared,valid=p.f===f&&landingPlanCurrent(f,p.context)&&!landingReadiness(f);
  if(!valid)this.cancel();return valid;
 }
 start(f){
  if(!this.readyFor(f))throw Error('進入状態が変わりました。着陸を再準備してください');
  const p=this.prepared;
  const pilot=new LandingPrototype(f,{preparedPlan:p.plan,preparedContext:p.context});
  this.previous={sas:f.sas,sasMode:f.sasMode,trim:f.trim};this.owner=f;this.pilot=pilot;this.prepared=null;this.state='running';this.reason=null;this.faultMessage=null;
  return pilot;
 }
 stop(reason='manual'){
  this.cancel();const f=this.owner;
  if(f&&this.pilot){Object.assign(f,this.previous);f.holdQ=f.q.clone();if(reason==='fault'||reason==='landed')f.throttle=0;if(reason==='landed')f.brake=true;}
  this.pilot=null;this.owner=null;this.state=reason==='fault'?'failed':reason==='landed'?'landed':'idle';this.reason=reason;
 }
 step(f,dt,{manual=false}={}){
  if(!this.pilot)return {};
  if(f!==this.owner||manual){this.stop(manual?'manual':'vessel changed');return {};}
  if(f.crashed||!Number.isFinite(dt)||dt<0){this.stop('fault');return {};}
  if(dt===0)return {};
  const problem=cruiseAuthority(f)||(this.pilot.phase==='rollout'?null:cruisePropulsion(f));
  if(problem){this.stop('fault');this.faultMessage=problem;return {};}
  const commands=this.pilot.update(f,dt);this.telemetry=this.pilot.telemetry;
  if(this.pilot.phase==='failed'){this.faultMessage=this.pilot.reason;this.stop('fault');return {};}
  if(this.pilot.phase==='stopped'){this.stop('landed');return {};}
  return commands;
 }
}
