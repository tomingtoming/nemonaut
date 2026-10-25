import {PLANET,center,orbitState} from './planet.js';
import {MOON,bodyState,advanceCelestialOrbit} from './celestial.js';
import {coastDrift} from './coast-orbit.js';
import {lambertArc} from './lambert.js';
import {predictTrajectory} from './trajectory.js';
import {captureBurnEstimate} from './lunar-capture.js';
import {engineBurn} from './resources.js';

// Search departure time on the actual parking conic. No seed position, clock,
// circularisation or propellant reset is applied to the vessel.
export function searchLunarDeparture(position,velocity,time,{preparation=120,phases=48,periods=2,flybys=[400000,800000,1200000]}={}){
 const orbit=orbitState(position,velocity);
 if(!orbit.stable||orbit.apoapsis+PLANET.radius>=MOON.orbitRadius-MOON.sphereOfInfluence)throw Error('母星の安全な待機軌道から計画してください');
 if(!Number.isFinite(time)||time<0||!Number.isFinite(preparation)||preparation<60||!Number.isInteger(phases)||phases<8||phases>96||!Number.isInteger(periods)||periods<1||periods>8||!Array.isArray(flybys)||flybys.length>8||!flybys.length||flybys.some(x=>!Number.isFinite(x)||Math.abs(x)>2000000))throw Error('月遷移探索の条件が不正です');
 const candidates=[];
 for(let i=0;i<phases*periods;i++){
  const delay=preparation+orbit.period*i/phases,departureTime=time+delay,at=coastDrift(position,velocity,time,delay),from=at.position.clone().sub(center);
  for(const duration of [12000,18000,24000,30000,36000])for(const offset of flybys){
   const moon=bodyState(MOON,departureTime+duration),radial=moon.position.clone().sub(center).normalize(),target=moon.position.clone().addScaledVector(radial,offset).sub(center);
   let arc;try{arc=lambertArc(from,target,duration,PLANET.mu,orbit.normal);}catch{continue;}
   const impulse=arc.departure.clone().sub(at.velocity),deltaV=impulse.length(),after=orbitState(at.position,arc.departure);
   if(deltaV>1500||deltaV<.5||after.periapsis<PLANET.atmosphereTop+1000)continue;
   candidates.push({plannedAt:time,time:departureTime,position:at.position,velocity:at.velocity,impulse,afterVelocity:arc.departure,deltaV,duration,offset});
  }
 }
 candidates.sort((a,b)=>a.deltaV-b.deltaV);
 for(const candidate of candidates.slice(0,32)){
  const prediction=predictTrajectory(candidate.position,candidate.afterVelocity,candidate.time,{duration:Math.min(604800,candidate.duration*1.6),samples:160});
  if(prediction.events.some(e=>e.type==='enter-moon')&&prediction.closest.altitude>10000&&prediction.closest.altitude<1000000&&!prediction.closest.atBoundary&&prediction.reason==='duration')return {...candidate,prediction};
 }
 throw Error('探索範囲内に安全な月接近案が見つかりません');
}

export function lunarDeparturePlan(vessel){
 if(vessel.throttle!==0)throw Error('噴射を停止してから月遷移を計画してください');
 captureBurnEstimate(vessel,1);
 const plan=searchLunarDeparture(vessel.pos.clone().add(vessel.stats.com.clone().applyQuaternion(vessel.q)),vessel.vel,vessel.universalTime);
 plan.burn=captureBurnEstimate(vessel,plan.deltaV);plan.startTime=plan.time-plan.burn.duration/2;plan.warnings=[];
 if(!plan.burn.enough)plan.warnings.push('現在の点火段では推進剤が不足しています');
 if(plan.startTime-vessel.universalTime<60)plan.warnings.push('姿勢調整の60秒を確保できません');
 if(plan.warnings.length){plan.ready=false;return plan;}
 const at=coastDrift(vessel.pos.clone().add(vessel.stats.com.clone().applyQuaternion(vessel.q)),vessel.vel,vessel.universalTime,plan.startTime-vessel.universalTime),fuel=new Map(vessel.fuel),direction=plan.impulse.clone().normalize();
 let pos=at.position,vel=at.velocity,time=plan.startTime,mass=vessel.stats.mass,left=plan.deltaV;
 for(let i=0;i<144000&&left>=.5;i++){
  const dt=1/120,before=[...fuel.values()].reduce((a,b)=>a+b,0),throttle=left<2?.01:left<10?.1:1;
  const thrust=[...engineBurn(vessel.networks,fuel,vessel.active,throttle,0,dt).values()].reduce((a,b)=>a+b,0),used=before-[...fuel.values()].reduce((a,b)=>a+b,0);
  if(thrust<=0)break;
  const next=advanceCelestialOrbit(pos,vel,direction.clone().multiplyScalar(thrust/mass),dt,time);pos=next.pos;vel=next.vel;time+=dt;left-=thrust/mass*dt;mass-=used;
 }
 plan.finite=predictTrajectory(pos,vel,time,{duration:plan.duration*1.6,samples:160});
 if(left>=.5||!plan.finite.events.some(e=>e.type==='enter-moon')||plan.finite.closest.altitude<10000||plan.finite.closest.altitude>1000000||plan.finite.closest.atBoundary||plan.finite.reason!=='duration')plan.warnings.push('有限噴射では安全な月接近を確認できません');
 plan.ready=plan.warnings.length===0;return plan;
}

export function lunarDepartureNode(plan,vessel){
 if(!plan.ready)throw Error(plan.warnings.join(' / '));
 if(plan.plannedAt!==vessel.universalTime)throw Error('時刻が進んだため月遷移案を再計算してください');
 return {universalTime:plan.startTime,time:vessel.time+plan.startTime-vessel.universalTime,position:plan.position.toArray(),velocity:plan.afterVelocity.toArray(),impulse:plan.impulse.toArray(),remaining:plan.impulse.toArray(),complete:false,departure:{midTime:plan.time,duration:plan.burn.duration,deltaV:plan.deltaV,periapsis:plan.finite.closest.altitude}};
}
