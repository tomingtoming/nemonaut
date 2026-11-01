import * as T from 'three';
import {MOON,bodyState,relativeMotion,referenceBody,advanceCelestialOrbit} from './celestial.js';

export interface TrajectoryBurn{time:number;deltaV:[number,number,number]}
export interface TrajectoryOptions{duration?:number;maxStep?:number;tolerance?:number;maxSteps?:number;samples?:number;chunk?:number;burn?:TrajectoryBurn|null}
export interface TrajectoryAsyncOptions extends TrajectoryOptions{signal?:AbortSignal|null;yieldTask?:()=>Promise<unknown>}
export interface TrajectoryPoint{time:number;position:number[];moon:number[];bodyId:import('./celestial.js').CelestialBodyId}
export type TrajectoryEvent={type:'burn';time:number}|{type:'enter-moon'|'leave-moon';time:number;position:number[]};
export interface TrajectoryClosest{time:number;distance:number;altitude:number;position:number[]}
export type TrajectoryEndReason='duration'|'surface'|'atmosphere'|'resolution'|'budget';
export interface TrajectoryProgress{steps:number;time:number}
export interface TrajectoryResult{points:TrajectoryPoint[];events:TrajectoryEvent[];closest:TrajectoryClosest&{atBoundary:boolean};startTime:number;endTime:number;requestedEndTime:number;complete:boolean;reason:TrajectoryEndReason;steps:number;burnApplied:boolean;position:number[];velocity:number[]}

// Cooperative iterator: the caller can move this to a worker or yield between
// chunks. Every sample uses a shared inertial frame and its own ephemeris epoch.
export function* trajectorySteps(position:T.Vector3,velocity:T.Vector3,time:number,{duration=21600,maxStep=20,tolerance=.001,maxSteps=100000,samples=800,chunk=256,burn=null}:TrajectoryOptions={}):Generator<TrajectoryProgress,TrajectoryResult,void>{
 if(![...position.toArray(),...velocity.toArray(),time,duration,maxStep,tolerance,maxSteps,samples,chunk].every(Number.isFinite)||time<0||duration<=0||duration>604800||maxStep<=0||tolerance<=0||maxSteps<1||samples<2||chunk<1)throw Error('予測条件が不正です');
 if(burn&&(!Number.isFinite(burn.time)||burn.time<time||!Array.isArray(burn.deltaV)||burn.deltaV.length!==3||!burn.deltaV.every(Number.isFinite)))throw Error('予測噴射が不正です');
 let pos=position.clone(),vel=velocity.clone(),now=time,steps=0,nextSample=time,applied=false,reason:TrajectoryEndReason='duration';
 const end=time+duration,interval=duration/samples,points:TrajectoryPoint[]=[],events:TrajectoryEvent[]=[],zero=new T.Vector3();
 let body=referenceBody(pos,now),closest=null as TrajectoryClosest|null;
 const sample=():TrajectoryPoint=>({time:now,position:pos.toArray(),moon:bodyState(MOON,now).position.toArray(),bodyId:body.id});
 const remember=()=>{const point=sample();if(points.at(-1)?.time!==now)points.push(point);};
 const checkClosest=()=>{const distance=pos.distanceTo(bodyState(MOON,now).position);if(!closest||distance<closest.distance)closest={time:now,distance,altitude:distance-MOON.radius,position:pos.toArray()};};
 remember();checkClosest();
 while(now<end&&steps<maxSteps){
  const local=relativeMotion(pos,vel,now,body),radius=local.r.length(),altitude=radius-body.radius;
  if(altitude<=0){reason='surface';break;}
  if(altitude<body.atmosphereTop){reason='atmosphere';break;}
  if(burn&&!applied&&now>=burn.time){vel.add(new T.Vector3(...burn.deltaV));applied=true;events.push({type:'burn',time:now});continue;}
  // Limit angular advance and approach to the SOI. A small crossing step
  // bounds the discontinuity error of the same patched-conic flight model.
  const moon=bodyState(MOON,now),moonRange=pos.distanceTo(moon.position),moonSpeed=vel.clone().sub(moon.velocity).length();
  const boundary=Math.abs(moonRange-MOON.sphereOfInfluence),crossingStep=Math.max(.02,boundary/Math.max(1,moonSpeed)*.5);
  const clearance=altitude-body.atmosphereTop,surfaceStep=Math.max(.02,clearance/Math.max(1,local.velocity.length())*.5);
  let dt=Math.min(maxStep,tolerance*Math.sqrt(radius**3/body.mu),crossingStep,surfaceStep,end-now);
  if(burn&&!applied&&burn.time>now)dt=Math.min(dt,burn.time-now);
  if(!(dt>0)||now+dt===now){reason='resolution';break;}
  const next=advanceCelestialOrbit(pos,vel,zero,dt,now);pos=next.pos;vel=next.vel;now+=dt;steps++;
  const nextBody=referenceBody(pos,now);if(nextBody.id!==body.id){events.push({type:nextBody.id==='moon'?'enter-moon':'leave-moon',time:now,position:pos.toArray()});body=nextBody;remember();}
  checkClosest();if(now>=nextSample){remember();nextSample=now+interval;}
  if(steps%chunk===0)yield {steps,time:now};
 }
 if(now<end&&steps>=maxSteps)reason='budget';remember();
 return {points,events,closest:{...closest!,atBoundary:closest!.time===time||closest!.time===now},startTime:time,endTime:now,requestedEndTime:end,complete:reason==='duration'&&now>=end,reason,steps,burnApplied:applied,position:pos.toArray(),velocity:vel.toArray()};
}

export function predictTrajectory(position:T.Vector3,velocity:T.Vector3,time:number,options?:TrajectoryOptions):TrajectoryResult{const iterator=trajectorySteps(position,velocity,time,options);let next:IteratorResult<TrajectoryProgress,TrajectoryResult>;do{next=iterator.next();}while(!next.done);return next.value;}

// Interpolate both comparison curves at one cursor epoch. The moon uses the
// analytical ephemeris; do not compare nearest samples at different times.
export function trajectoryAt(result:Pick<TrajectoryResult,'startTime'|'endTime'|'points'>,time:number):{time:number;position:number[];moon:number[];clamped:boolean}{
 const t=Math.max(result.startTime,Math.min(result.endTime,time)),points=result.points;
 let lo=0,hi=points.length-1;while(lo+1<hi){const mid=(lo+hi)>>1;if(points[mid].time<=t)lo=mid;else hi=mid;}
 const a=points[lo],b=points[hi],fraction=b.time>a.time?(t-a.time)/(b.time-a.time):0;
 return {time:t,position:a.position.map((n,i)=>n+(b.position[i]-n)*fraction),moon:bodyState(MOON,t).position.toArray(),clamped:t!==time};
}

export async function predictTrajectoryAsync(position:T.Vector3,velocity:T.Vector3,time:number,{signal,yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0)),...options}:TrajectoryAsyncOptions={}):Promise<TrajectoryResult>{
 const iterator=trajectorySteps(position,velocity,time,options);
 try{while(true){if(signal?.aborted)throw new DOMException('予測を中断しました','AbortError');const next=iterator.next();if(next.done)return next.value;await yieldTask();}}
 finally{(iterator as Generator<TrajectoryProgress,TrajectoryResult|void,void>).return();}
}
