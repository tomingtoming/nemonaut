import * as T from 'three';
import {PARTS} from './catalog.js';
import {fleet} from './fleet.js';
import {bodyOrbitState,bodyState,referenceBody} from './celestial.js';
import {coastDrift,coastStepLimit} from './coast-orbit.js';
import {powerStep} from './power.js';
import {THERMAL} from './thermal.js';
import {atmosphere} from './planet.js';

const zero=new T.Vector3(),commands={pitch:0,yaw:0,roll:0};
const center=v=>v.pos.clone().add(v.stats.com.clone().applyQuaternion(v.q));

// Vacuum radiation only. Limit the fractional temperature change rather than
// taking a fixed number of steps per elapsed second; no ablator is consumed.
export function coolVacuum(parts,states,dt){return coolStationary(parts,states,dt,{density:0,temperature:3});}
export function coolStationary(parts,states,dt,air){
 if(!Number.isFinite(dt)||dt<=0)throw Error('冷却時間が不正です');
 for(const p of parts){
  const d=PARTS[p.type],s=states.get(p.id),[x,y,z]=d.size;
  if(!s||!Number.isFinite(s.temperature)||s.temperature<3)throw Error('真空冷却の温度が不正です');
  const surface=2*(x*y+y*z+z*x),capacity=Math.max(1,d.mass)*(d.heatCapacity||THERMAL.heatCapacity);
  const k=(d.emissivity||THERMAL.emissivity)*THERMAL.sigma*surface/capacity,convection=air.density*10*surface/capacity,ambient=air.density>1e-9?air.temperature:3;
  let left=dt,count=0,t=s.temperature;
  while(left>0){
   if(++count>10000)throw Error('真空冷却の計算上限です');
   const h=Math.min(left,.04/(4*k*Math.max(ambient,t)**3+convection)),rate=n=>-k*(n**4-ambient**4)-convection*(n-ambient),mid=t+rate(t)*h/2;
   t=Math.max(Math.min(t,ambient),Math.min(Math.max(t,ambient),t+rate(mid)*h));left-=h;
  }
  s.temperature=t;
 }
}

export function isParked(v){
 const body=referenceBody(v.pos,v.universalTime);
 const contact=(v.landed&&v.landedTime>.5)||(v.brake&&v.time>.5&&v.telemetry.contacts>0);
 return contact&&v.environment!=='water'&&v.vel.clone().sub(bodyState(body,v.universalTime).velocity).length()<.1&&v.omega.length()<.01;
}

function deadline(v){
 let result=Infinity;
 if(v.transferGuide?.firstBurnTime===null)result=v.transferGuide.startTime;
 if(v.maneuver&&!v.maneuver.complete)result=Math.min(result,(v.maneuver.universalTime??v.universalTime+v.maneuver.time-v.time)-(v.maneuver.capture?45:0));
 return result;
}

export function coastEligibility(root,{input=false}={}){
 if(input)return '操作中';
 for(const v of fleet(root)){
  if(v.universalTime!==root.universalTime)return '機体の共通時刻が不一致';
  if(v.crashed)continue;
  if(v.throttle!==0)return '推力設定のある機体';
  if([...v.thermal.values()].some(s=>s.failed||!Number.isFinite(s.temperature)||s.temperature<3))return '熱状態を確認してください';
  if(isParked(v))continue;
  const limit=coastStepLimit(center(v),v.vel,v.universalTime,{deadline:deadline(v)});
  if(limit.dt<.05)return {surface:'大気・地表への接近',soi:'月重力圏の境界',maneuver:'予定噴射の直前'}[limit.reason]||'通常物理が必要';
 }
 return null;
}

// All vessels advance together or none do. SAS/RCS torques are suspended in
// this coast mode. Attitude is frozen; stored angular velocity is retained for
// resuming normal physics. UI must explicitly describe this on-rails contract.
// Max 5 seconds per resource sample bounds eclipse/solar sampling error.
export function advanceCoastFleet(root,requested,{input=false,maxSteps=64}={}){
 if(!Number.isFinite(requested)||requested<=0||!Number.isInteger(maxSteps)||maxSteps<1||maxSteps>10000)throw Error('時間加速の要求が不正です');
 let advanced=0,steps=0,reason=coastEligibility(root,{input});
 const vessels=fleet(root);
 while(!reason&&advanced<requested&&steps<maxSteps){
  let dt=Math.min(5,requested-advanced),limiting=null;
  for(const v of vessels){if(v.crashed||isParked(v))continue;const limit=coastStepLimit(center(v),v.vel,v.universalTime,{requested:dt,deadline:deadline(v)});if(limit.dt<dt){dt=limit.dt;limiting=limit.reason;}}
  // Guard encounters between retained vehicles, including a fast fly-through.
  for(let i=0;i<vessels.length;i++)for(let j=i+1;j<vessels.length;j++){
   const a=vessels[i],b=vessels[j];if(a.crashed||b.crashed||(isParked(a)&&isParked(b)))continue;
   const clearance=center(a).distanceTo(center(b))-100;
   const safe=Math.max(0,clearance)/(a.vel.clone().sub(b.vel).length()+100)*.5;
   if(safe<dt){dt=safe;limiting='proximity';}
  }
  if(dt<.05&&dt<requested-advanced){reason={surface:'大気・地表への接近',soi:'月重力圏の境界',maneuver:'予定噴射の直前',proximity:'他機体への接近'}[limiting]||'通常物理が必要';break;}
  const time=root.universalTime,end=time+dt;
  if(end===time){reason='時刻の計算精度の上限';break;}
  // Compute on copies first: a failed propagation cannot split fleet clocks.
  const updates=vessels.map(v=>{
   if(v.crashed){const body=referenceBody(v.pos,time),a=bodyState(body,time),b=bodyState(body,end);return {v,pos:v.pos.clone().add(b.position).sub(a.position),vel:v.vel.clone().add(b.velocity).sub(a.velocity)};}
   const c=center(v),parked=isParked(v),body=referenceBody(c,time),start=bodyState(body,time);
   const drift=duration=>{if(!parked)return coastDrift(c,v.vel,time,duration);const end=bodyState(body,time+duration);return {position:c.clone().add(end.position).sub(start.position),velocity:v.vel.clone().add(end.velocity).sub(start.velocity)};};
   const next=drift(dt),mid=drift(dt/2),q=v.q.clone(),air=parked&&body.id==='planet'?atmosphere(c.distanceTo(start.position)-body.radius):{density:0,pressure:0,temperature:3};
   const charge=new Map(v.charge),thermal=new Map([...v.thermal].map(([id,s])=>[id,{...s}]));
   const power=powerStep(v.parts,charge,mid.position,q,commands,false,dt,time+dt/2);
   coolStationary(v.parts,thermal,dt,air);
   return {v,parked,air,pos:next.position.clone().sub(v.stats.com.clone().applyQuaternion(q)),vel:next.velocity,q,charge,thermal,power,orbit:bodyOrbitState(next.position,next.velocity,end)};
  });
  for(const u of updates){
   const v=u.v;v.pos.copy(u.pos);v.vel.copy(u.vel);v.universalTime=end;
   if(v.crashed)continue;
   v.time+=dt;v.q.copy(u.q);v.charge=u.charge;v.thermal=u.thermal;v.orbit=u.orbit;
   v.landed=u.parked;v.landedTime=u.parked?Math.max(.500001,v.landedTime)+dt:0;v.lastThrust=0;v.engineThrust.clear();v.rcsJets=[];
   v.maxAltitude=Math.max(v.maxAltitude,u.orbit.altitude);
   v.telemetry={power:u.power,force:zero.clone(),torque:zero.clone(),engineForce:zero.clone(),commands:{...commands},stallCount:0,contacts:0,atmosphere:u.air,engine:'Kepler coast'};
  }
  advanced+=dt;steps++;reason=coastEligibility(root);
 }
 return {advanced,steps,reason,remaining:Math.max(0,requested-advanced)};
}
