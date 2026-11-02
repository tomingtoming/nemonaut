import * as T from 'three';
import {atmosphere} from './planet.js';
import {surfaceRelativeVelocity} from './surface-frame.js';
import {createBodyAerodynamics,bodyDrag} from './body-drag.js';
import {PARTS,type Part} from './catalog.js';
import {captureBurnEstimate,type BurnEstimateVessel} from './lunar-capture.js';
import {fuelNetworks,engineBurn} from './resources.js';
import {coastDrift} from './coast-orbit.js';
import {advanceCelestialOrbit,bodyOrbitState,type OrbitState} from './celestial.js';

// Ideal, fixed inertial thrust direction with body drag and pressure-dependent thrust.
// No attitude dynamics, wing lift, thermal damage, parachutes or staging.
// The live vessel and its fuel are never changed by this comparison.
/** The vessel fields the finite-burn comparison reads (never changed). */
export interface FiniteBurnVessel extends BurnEstimateVessel{parts:Part[];universalTime:number;throttle:number;chutes?:ReadonlyMap<string,import('./recovery.js').ParachuteState>|null;pos:T.Vector3;q:T.Quaternion;vel:T.Vector3;stats:{mass:number;com:T.Vector3}}
export interface FiniteBurnOptions{throttle?:number;tolerance?:number;step?:number}
export interface FiniteBurnPreview{atmospheric:boolean;computedAt:number;startTime:number;endTime:number;duration:number;throttle:number;delivered:number;fuelUsed:number;orbit:OrbitState;points:T.Vector3[]}
export function finiteBurnPreview(vessel:FiniteBurnVessel,impulse:T.Vector3|null|undefined,startTime:number,{throttle=.1,tolerance=.05,step=.1}:FiniteBurnOptions={}):FiniteBurnPreview{
 const deltaV=impulse?.length();
 if(startTime<vessel.universalTime)throw Error('噴射開始が過去になります。計画地点を先へ移してください');
 if(!Number.isFinite(startTime)||startTime<vessel.universalTime||startTime-vessel.universalTime>604800)throw Error('噴射開始は現在から7日以内にしてください');
 if(!Number.isFinite(throttle)||throttle<=0||throttle>1||![.05,.5].includes(tolerance)||!Number.isFinite(step)||step<.01||step>.5||!impulse||deltaV===undefined||!Number.isFinite(deltaV)||deltaV<=tolerance||deltaV>10000||!impulse.toArray().every(Number.isFinite))throw Error('噴射条件が不正です');
 if(vessel.throttle!==0)throw Error('スロットルを0にしてから比較してください');
 if(vessel.parts.some(p=>PARTS[p.type].wing)||[...(vessel.chutes?.values()??[])].some(c=>c.fraction>0))throw Error('翼・展開中のパラシュートを持つ機体は未対応です');
 const estimate=captureBurnEstimate(vessel,deltaV);
 if(!estimate.enough)throw Error('現在の点火段の燃料が不足しています');
 if(estimate.duration/throttle>1200)throw Error('20分を超える噴射は比較対象外です');
 const center=vessel.pos.clone().add(vessel.stats.com.clone().applyQuaternion(vessel.q));
 const coast=coastDrift(center,vessel.vel,vessel.universalTime,startTime-vessel.universalTime);
 let pos=coast.position,vel=coast.velocity,time=startTime,delivered=0,mass=vessel.stats.mass;
 const fuel=new Map<string,number>(vessel.fuel),networks=fuelNetworks(vessel.parts),active=new Set(vessel.parts.filter(p=>vessel.active.has(p.id)&&PARTS[p.type].thrust&&!PARTS[p.type].air&&!PARTS[p.type].water).map(p=>p.id)),direction=impulse.clone().normalize();
 const orientation=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0).applyQuaternion(vessel.q),direction).multiply(vessel.q),aerodynamics=createBodyAerodynamics(vessel.parts);
 let atmospheric=false;
 const sum=(f:ReadonlyMap<string,number>)=>[...f.values()].reduce((a,b)=>a+b,0),initialFuel=sum(fuel),points=[pos.clone()];let count=0;
 while(delivered<deltaV-tolerance-1e-9){
  const orbit=bodyOrbitState(pos,vel,time);
  if(orbit.altitude<50000&&orbit.bodyId==='planet'||orbit.altitude<1000)throw Error('噴射中に低高度へ入るため熱・接地を含む予測が必要です');
  atmospheric ||= orbit.altitude<orbit.body.atmosphereTop;
  const air=orbit.bodyId==='planet'?atmosphere(orbit.altitude):{density:0,pressure:0},relative=surfaceRelativeVelocity(pos,vel,time,orbit.body);
  const before=new Map<string,number>(fuel),beforeMass=sum(fuel),forces=engineBurn(networks,fuel,active,throttle,air.density,step,air.pressure),force=[...forces.values()].reduce((a,b)=>a+b,0);
  if(!(force>0))throw Error('噴射途中で燃料が不足しました');
  const fraction=Math.min(1,(deltaV-tolerance-delivered)/(force/mass*step)),dt=step*fraction;
  if(fraction<1)for(const [id,value]of before){const current=fuel.get(id);if(current===undefined)throw Error('燃料タンクの残量が見つかりません');fuel.set(id,value-(value-current)*fraction);}
  const next=advanceCelestialOrbit(pos,vel,direction.clone().multiplyScalar(force).add(bodyDrag(aerodynamics,orientation,relative,air.density).force).divideScalar(mass),dt,time);
  pos=next.pos;vel=next.vel;time+=dt;delivered+=force/mass*dt;mass-=beforeMass-sum(fuel);
  if(++count%20===0)points.push(pos.clone());
  if(time-startTime>1200)throw Error('噴射の計算時間上限に達しました');
 }
 const orbit=bodyOrbitState(pos,vel,time);
 if(orbit.altitude<50000&&orbit.bodyId==='planet'||orbit.altitude<1000)throw Error('噴射中に低高度へ入るため熱・接地を含む予測が必要です');
 points.push(pos.clone());
 return {atmospheric,computedAt:vessel.universalTime,startTime,endTime:time,duration:time-startTime,throttle,delivered,fuelUsed:initialFuel-sum(fuel),orbit,points};
}
