import {updateNavigationFrame,type NavigationFrameFlight} from './navigation-frame.js';
import {observationDemand,advanceObservations,type ObservationVessel,type ObservationMap,type ObservationState} from './observation.js';
import {frozenSurfaceState,surfaceRelativeVelocity,surfaceAngularVelocity,surfaceOrientation,surfaceVelocity,type FrozenSurfaceSubject,type FrozenSurfaceState} from './surface-frame.js';
import {pendingBurns,type BurnScheduleVessel} from './burn-schedule.js';
import * as T from 'three';
import {PARTS,type PartCatalog} from './catalog.js';
import {isParked,type ParkedVessel} from './ground-rest.js';
export {isParked} from './ground-rest.js';
import {fleet,type FleetNode} from './fleet.js';
import {bodyOrbitState,bodyState,referenceBody,type BodyState,type OrbitState} from './celestial.js';
import {coastDrift,coastStepLimit,type CoastLimitReason} from './coast-orbit.js';
import {powerStep,type PowerPart,type PowerReading,type ChargeMap} from './power.js';
import {THERMAL,type ThermalState,type ThermalMap} from './thermal.js';
import {atmosphere} from './planet.js';
import {engineBurn} from './resources.js';

export type CoastPart=import('./aero.js').AeroPart&PowerPart;
export interface CoastTelemetry{power:PowerReading;force:T.Vector3;torque:T.Vector3;engineForce:T.Vector3;commands:{pitch:number;yaw:number;roll:number};stallCount:number;contacts:number;/** Written by each coast step; absent on a vessel that has not stepped yet. */atmosphere?:{density:number;pressure:number;temperature:number};engine:string}
export interface CoastVessel extends ParkedVessel,BurnScheduleVessel,NavigationFrameFlight,ObservationVessel,FleetNode<CoastVessel>{parts:readonly CoastPart[];stats:{com:T.Vector3;mass:number};vesselId:string;vesselName?:string|null;throttle:number;failureDynamics?:boolean;thermal:ThermalMap;charge:ChargeMap;observations:ObservationMap;orbit?:OrbitState|null;lastThrust:number;engineThrust:Map<string,number>;rcsJets:readonly import('./rcs.js').RcsJet[];maxAltitude:number;telemetry:CoastTelemetry}
export type CoastMarginVessel=Pick<import('./descent.js').DescentVessel,'pos'|'q'|'stats'|'vel'|'universalTime'|'networks'|'fuel'|'started'|'active'>;
export interface CoastBlocker{reason:string;code:string|null;vesselId:string|null;vesselName:string;otherVesselId:string|null;otherVesselName:string|null;overdue:boolean;scheduledTime:number|null}
interface FrozenCoastUpdate extends FrozenSurfaceState{v:CoastVessel}
interface LiveCoastUpdate{v:CoastVessel;parked:boolean|undefined;air:{density:number;pressure:number;temperature:number};turn:T.Quaternion;pos:T.Vector3;vel:T.Vector3;q:T.Quaternion;charge:ChargeMap;thermal:ThermalMap;power:PowerReading;observations:ObservationMap;orbit:OrbitState}
export interface CoastOptions{input?:boolean;maxSteps?:number}
export interface CoastResult{universalTime:number;advanced:number;steps:number;reason:string|null;blocker:CoastBlocker|null;remaining:number}

const zero=new T.Vector3(),commands={pitch:0,yaw:0,roll:0};
const center:(v:FrozenSurfaceSubject)=>T.Vector3=v=>v.pos.clone().add(v.stats.com.clone().applyQuaternion(v.q));

// Vacuum radiation only. Limit the fractional temperature change rather than
// taking a fixed number of steps per elapsed second; no ablator is consumed.
export function coolVacuum(parts:readonly {id:string;type:string}[],states:ReadonlyMap<string,Pick<ThermalState,'temperature'>>,dt:number):void{return coolStationary(parts,states,dt,{density:0,temperature:3});}
export function coolStationary(parts:readonly {id:string;type:string}[],states:ReadonlyMap<string,Pick<ThermalState,'temperature'>>,dt:number,air:{density:number;temperature:number}):void{
 if(!Number.isFinite(dt)||dt<=0)throw Error('冷却時間が不正です');
 for(const p of parts){
  const d=(PARTS as PartCatalog)[p.type],s=states.get(p.id),[x,y,z]=d.size;
  if(!s||!Number.isFinite(s.temperature)||s.temperature<3)throw Error('真空冷却の温度が不正です');
  const surface=2*(x*y+y*z+z*x),capacity=Math.max(1,d.mass)*(d.heatCapacity||THERMAL.heatCapacity);
  const k=(d.emissivity||THERMAL.emissivity)*THERMAL.sigma*surface/capacity,convection=air.density*10*surface/capacity,ambient=air.density>1e-9?air.temperature:3;
  let left=dt,count=0,t=s.temperature;
  while(left>0){
   if(++count>10000)throw Error('真空冷却の計算上限です');
   const h=Math.min(left,.04/(4*k*Math.max(ambient,t)**3+convection)),rate:(n:number)=>number=n=>-k*(n**4-ambient**4)-convection*(n-ambient),mid=t+rate(t)*h/2;
   t=Math.max(Math.min(t,ambient),Math.min(Math.max(t,ambient),t+rate(mid)*h));left-=h;
  }
  s.temperature=t;
 }
}


function deadline(v:BurnScheduleVessel):number{const burn=pendingBurns(v)[0];return burn?burn.cutoff+15:Infinity;}

export function coastSurfaceMargin(v:CoastMarginVessel):number{
 const o=bodyOrbitState(center(v),v.vel,v.universalTime),fall=Math.max(0,-o.vertical);
 if(o.bodyId!=='moon'||fall<5)return 1000;
 const thrust=[...engineBurn(v.networks,new Map<string,number>(v.fuel),v.started?v.active:new Set(),1,0,.001).values()].reduce((a,b)=>a+b,0),net=thrust/v.stats.mass-o.gravity;
 // Leave braking distance plus ten seconds for attitude/input, even though
 // actual steering and manual throttle can need more. Never promise a landing.
 const brakingSpeed=o.periapsis<1000?o.speed:fall;
 return net>0?1000+brakingSpeed*10+1.5*brakingSpeed*brakingSpeed/(2*net):1000+brakingSpeed*20;
}

function blocker(reason:string,v:CoastVessel,code:string|null=null,other:CoastVessel|null=null):CoastBlocker{
 const anchor:(x:CoastVessel)=>string|null=x=>(x.parts.find(p=>(PARTS as PartCatalog)[p.type].control)||x.parts[0])?.id??null;
 const scheduled=pendingBurns(v)[0]?.time??null;
 return {reason,code,vesselId:anchor(v),vesselName:v.vesselName||'名称未設定の機体',otherVesselId:other?anchor(other):null,otherVesselName:other?.vesselName||null,overdue:code==='maneuver'&&scheduled!==null&&scheduled<v.universalTime,scheduledTime:code==='maneuver'?scheduled:null};
}
export function coastBlocker(root:CoastVessel,options:CoastOptions={}):CoastBlocker|null{return worldCoastBlocker(fleet(root),root.universalTime,root,options);}
function throttleBlocksCoast(v:CoastVessel,active:CoastVessel):boolean{
 if(v.throttle===0)return false;
 // Keep the pilot's cutoff requirement. Only inert, uncontrolled debris may
 // retain an inherited throttle setting; wheels and marine drives need physics.
 if(v===active||v.parts.some(p=>(PARTS as PartCatalog)[p.type].control||p.type==='wheel'||(PARTS as PartCatalog)[p.type].water))return true;
 // Sample on a copy, with sea-level air as a conservative jet bound. A jet
 // currently in vacuum must not become powered unnoticed on atmospheric entry.
 return [...engineBurn(v.networks,new Map<string,number>(v.fuel),v.started?v.active:new Set(),v.throttle,1.225,1/120).values()].some(force=>force>0);
}
function worldCoastBlocker(vessels:readonly CoastVessel[],universalTime:number,active:CoastVessel,{input=false}:CoastOptions={}):CoastBlocker|null{
 if(input)return blocker('操作中',active,'input');
 for(const v of vessels){
  if(v.universalTime!==universalTime)return blocker('機体の共通時刻が不一致',v,'clock');
  if(v.crashed&&!v.failureDynamics)continue;
  if(throttleBlocksCoast(v,active))return blocker('推力設定のある機体',v,'thrust');
  if([...v.thermal.values()].some(s=>(s.failed&&!v.failureDynamics)||!Number.isFinite(s.temperature)||s.temperature<3))return blocker('熱状態を確認してください',v,'thermal');
  if(isParked(v))continue;
  const limit=coastStepLimit(center(v),v.vel,v.universalTime,{deadline:deadline(v),surfaceMargin:coastSurfaceMargin(v)});
  if(limit.dt<.05)return blocker({surface:'大気・地表への接近',soi:'月重力圏の境界',maneuver:'予定噴射の直前'}[limit.reason as CoastLimitReason]||'通常物理が必要',v,limit.reason);
 }
 return null;
}

export function coastEligibility(root:CoastVessel,options?:CoastOptions):string|null{return coastBlocker(root,options)?.reason??null;}

// All vessels advance together or none do. SAS/RCS torques are suspended in
// this coast mode. Attitude is frozen; stored angular velocity is retained for
// resuming normal physics. UI must explicitly describe this on-rails contract.
// Max 5 seconds per resource sample bounds eclipse/solar sampling error.
export function advanceCoastFleet(root:CoastVessel,requested:number,options:CoastOptions={}):CoastResult{return advanceWorldCoast(fleet(root),root.universalTime,root.vesselId,requested,options);}
export function advanceWorldCoast(vessels:readonly CoastVessel[],universalTime:number,activeVesselId:string,requested:number,{input=false,maxSteps=64}:CoastOptions={}):CoastResult{
 const active=vessels.find(v=>v.vesselId===activeVesselId);
 if(!active||new Set(vessels.map(v=>v.vesselId)).size!==vessels.length||!Number.isFinite(universalTime))throw Error('高速航行の世界が不正です');
 if(!Number.isFinite(requested)||requested<=0||!Number.isInteger(maxSteps)||maxSteps<1||maxSteps>10000)throw Error('時間加速の要求が不正です');
 let advanced=0,steps=0,blocked=worldCoastBlocker(vessels,universalTime,active,{input}),reason=blocked?.reason??null;

 while(!reason&&advanced<requested&&steps<maxSteps){
  let dt=Math.min(5,requested-advanced),limiting:CoastLimitReason|'proximity'|null=null,limitingVessel:CoastVessel|null=null,nearby:CoastVessel|null=null;
  for(const v of vessels){if((v.crashed&&!v.failureDynamics)||isParked(v))continue;const limit=coastStepLimit(center(v),v.vel,v.universalTime,{requested:dt,deadline:deadline(v),surfaceMargin:coastSurfaceMargin(v)});if(limit.dt<dt){dt=limit.dt;limiting=limit.reason;limitingVessel=v;nearby=null;}}
  // Guard encounters between retained vehicles, including a fast fly-through.
  for(let i=0;i<vessels.length;i++)for(let j=i+1;j<vessels.length;j++){
   const a=vessels[i],b=vessels[j];if((a.crashed&&!a.failureDynamics)||(b.crashed&&!b.failureDynamics)||(isParked(a)&&isParked(b)))continue;
   const clearance=center(a).distanceTo(center(b))-100;
   const safe=Math.max(0,clearance)/(a.vel.clone().sub(b.vel).length()+100)*.5;
   if(safe<dt){dt=safe;limiting='proximity';limitingVessel=a;nearby=b;}
  }
  if(dt<.05&&dt<requested-advanced){reason={surface:'大気・地表への接近',soi:'月重力圏の境界',maneuver:'予定噴射の直前',proximity:'他機体への接近'}[limiting as CoastLimitReason|'proximity']||'通常物理が必要';blocked=blocker(reason,limitingVessel||active,limiting,nearby);break;}
  const time=universalTime,end=time+dt;
  if(end===time){
   // A completed multi-step request can leave a sub-ULP subtraction residue.
   // Keep the actual clock/advanced amount, without turning this into a hazard.
   if(steps>0&&dt===requested-advanced&&dt<=Number.EPSILON*Math.max(1,Math.abs(time)))break;
   reason='時刻の計算精度の上限';blocked=blocker(reason,active,'precision');break;
  }
  // Compute on copies first: a failed propagation cannot split fleet clocks.
  const updates:(FrozenCoastUpdate|LiveCoastUpdate)[]=vessels.map(v=>{
   if(v.crashed&&!v.failureDynamics)return {v,...frozenSurfaceState(v,time,dt)};
   const c=center(v),parked=isParked(v),body=referenceBody(c,time),start=bodyState(body,time);
   const drift:(duration:number)=>BodyState=duration=>{if(!parked)return coastDrift(c,v.vel,time,duration);const end=bodyState(body,time+duration),turn=surfaceOrientation(duration,body),position=c.clone().sub(start.position).applyQuaternion(turn).add(end.position),velocity=surfaceVelocity(position,time+duration,body);return {position,velocity};};
   const next=drift(dt),mid=drift(dt/2),turn=parked?surfaceOrientation(dt,body):new T.Quaternion(),q=v.q.clone().premultiply(turn),midQ=parked?v.q.clone().premultiply(surfaceOrientation(dt/2,body)):q,air=parked&&body.id==='planet'?atmosphere(c.distanceTo(start.position)-body.radius):{density:0,pressure:0,temperature:3};
   const charge=new Map<string,number>(v.charge),thermal=new Map<string,ThermalState>([...v.thermal].map(([id,s])=>[id,{...s}]));
   const power=powerStep(v.parts,charge,mid.position,midQ,commands,false,dt,time+dt/2,observationDemand(v));
   const observations=new Map<string,ObservationState>([...v.observations].map(([id,s])=>[id,structuredClone(s)]));advanceObservations({...v,landed:parked,pos:mid.position.clone().sub(v.stats.com.clone().applyQuaternion(midQ)),q:midQ,vel:mid.velocity,universalTime:time+dt/2},observations,power,dt);
   coolStationary(v.parts,thermal,dt,air);
   return {v,parked,air,turn,pos:next.position.clone().sub(v.stats.com.clone().applyQuaternion(q)),vel:next.velocity,q,charge,thermal,power,observations,orbit:bodyOrbitState(next.position,next.velocity,end)};
  });
  for(const u of updates){
   const v=u.v;v.pos.copy(u.pos);v.vel.copy(u.vel);v.universalTime=end;
   if(v.crashed&&!v.failureDynamics){v.q.copy(u.q);v.omega.copy((u as FrozenCoastUpdate).omega);if(v.holdQ)v.holdQ.premultiply(u.turn).normalize();v.orbit=bodyOrbitState(center(v),v.vel,end);continue;}
   v.time+=dt;v.q.copy(u.q);if((u as LiveCoastUpdate).parked){v.omega.copy(surfaceAngularVelocity(referenceBody(center(v),end)));if(v.holdQ)v.holdQ.premultiply(u.turn);}v.charge=(u as LiveCoastUpdate).charge;v.observations=(u as LiveCoastUpdate).observations;v.thermal=(u as LiveCoastUpdate).thermal;v.orbit=(u as LiveCoastUpdate).orbit;
   v.landed=(u as LiveCoastUpdate).parked;v.landedTime=(u as LiveCoastUpdate).parked?Math.max(.500001,v.landedTime)+dt:0;v.lastThrust=0;v.engineThrust.clear();v.rcsJets=[];
   v.maxAltitude=Math.max(v.maxAltitude,(u as LiveCoastUpdate).orbit.altitude);updateNavigationFrame(v);
   v.telemetry={power:(u as LiveCoastUpdate).power,force:zero.clone(),torque:zero.clone(),engineForce:zero.clone(),commands:{...commands},stallCount:0,contacts:0,atmosphere:(u as LiveCoastUpdate).air,engine:'Kepler coast'};
  }
  universalTime=end;advanced+=dt;steps++;blocked=worldCoastBlocker(vessels,universalTime,active);reason=blocked?.reason??null;
 }
 return {universalTime,advanced,steps,reason,blocker:blocked,remaining:Math.max(0,requested-advanced)};
}
