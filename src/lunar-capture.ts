import * as T from 'three';
import {PARTS} from './catalog.js';
import {bodyOrbitState,MOON} from './celestial.js';
import {apsisPlan} from './orbit-plan.js';
import {coastDrift} from './coast-orbit.js';
import {fuelNetworks,engineBurn} from './resources.js';

// Reference finite burn with the actual active fuel networks. This is a
// thrust-duration estimate, not an attitude/gravity simulation or autopilot.
export function captureBurnEstimate(vessel,deltaV){
 if(!Number.isFinite(deltaV)||deltaV<=0)throw Error('減速量が不正です');
 const engines=vessel.parts.filter(p=>vessel.started&&vessel.active.has(p.id)&&PARTS[p.type].thrust&&!PARTS[p.type].air&&!PARTS[p.type].water);
 if(!engines.length)throw Error('点火済みのロケットエンジンが必要です（スロットルは0）');
 if(!vessel.rocketAxes)throw Error('月周回案内は主推力が機体の上方向のロケットに対応しています');
 for(const p of engines){const axis=new T.Vector3(0,1,0).applyEuler(new T.Euler(...p.r));if(axis.angleTo(new T.Vector3(0,1,0))>.01)throw Error('主エンジンの推力軸を機体の上方向へ揃えてください');}
 const active=new Set(engines.map(p=>p.id)),fuel=new Map(vessel.fuel),networks=fuelNetworks(vessel.parts),initialMass=vessel.stats.mass;
 let delivered=0,time=0,consumed=0,thrust=0;
 const sum=map=>[...map.values()].reduce((a,b)=>a+b,0),initialFuel=sum(fuel);
 for(let i=0;i<12000&&delivered<deltaV;i++){
  const dt=.1,before=sum(fuel),forces=engineBurn(networks,fuel,active,1,0,dt),force=[...forces.values()].reduce((a,b)=>a+b,0),used=before-sum(fuel);
  if(i===0)thrust=force;
  if(force<=0)break;
  const mass=initialMass-consumed,increment=used>0?force*dt/used*Math.log(mass/(mass-used)):force*dt/mass;
  const fraction=Math.min(1,(deltaV-delivered)/increment);
  delivered+=increment*fraction;time+=dt*fraction;consumed+=used*fraction;
 }
 return {duration:time,fuelRequired:consumed,fuelRemaining:initialFuel-consumed,thrust,acceleration:thrust/initialMass,enough:delivered>=deltaV-1e-6,achievableDeltaV:delivered};
}

export function lunarCapturePlan(vessel){
 const time=vessel.universalTime,pos=vessel.pos.clone().add(vessel.stats.com.clone().applyQuaternion(vessel.q)),orbit=bodyOrbitState(pos,vessel.vel,time);
 if(orbit.bodyId!=='moon')throw Error('月重力圏へ入ってから計画してください');
 if(vessel.throttle!==0)throw Error('スロットルを0にしてから計画してください');
 if(orbit.energy<0&&orbit.apoapsis+MOON.radius<MOON.sphereOfInfluence)throw Error('既に月重力圏内の周回軌道です');
 if(orbit.vertical>=0)throw Error('月の近点を通過済みです。次回の接近を計画してください');
 if(orbit.periapsis<1000)throw Error('近点が月面に近すぎます。先に衝突を避ける軌道へ修正してください');
 const peri=apsisPlan(orbit).periapsis;
 if(!peri||!Number.isFinite(peri.time)||peri.time<=0)throw Error('月の近点を通過済み、または到達時刻を求められません');
 const deltaV=-peri.deltaV;
 if(!(deltaV>.5))throw Error('近点での減速量を求められません');
 const burn=captureBurnEstimate(vessel,deltaV),midTime=time+peri.time,startTime=midTime-burn.duration/2;
 const at=coastDrift(pos,vessel.vel,time,peri.time),atOrbit=bodyOrbitState(at.position,at.velocity,midTime);
 if(atOrbit.bodyId!=='moon')throw Error('近点の前に月重力圏を離れる軌道です');
 const impulse=atOrbit.relativeVelocity.clone().normalize().multiplyScalar(-deltaV),afterVelocity=at.velocity.clone().add(impulse),afterOrbit=bodyOrbitState(at.position,afterVelocity,midTime);
 const warnings=[];
 if(!burn.enough)warnings.push('現在の点火段では推進剤または噴射時間が不足');
 if(startTime-time<60)warnings.push('噴射開始までの姿勢調整時間が不足（60秒必要）');
 const localScale=Math.sqrt((MOON.radius+orbit.periapsis)**3/MOON.mu);
 if(burn.duration>localScale*.1)warnings.push('長時間噴射のため瞬間噴射の予測との差が大きい');
 return {time,midTime,startTime,deltaV,burn,position:at.position,velocity:at.velocity,impulse,afterVelocity,afterOrbit,periapsis:orbit.periapsis,warnings,ready:warnings.length===0};
}

export function captureNode(plan,vessel){
 if(!plan.ready)throw Error(plan.warnings.join(' / '));
 if(plan.time!==vessel.universalTime)throw Error('時刻が進んだため月周回案を再計算してください');
 return {universalTime:plan.startTime,time:vessel.time+plan.startTime-vessel.universalTime,position:plan.position.toArray(),velocity:plan.afterVelocity.toArray(),impulse:plan.impulse.toArray(),remaining:plan.impulse.toArray(),complete:false,capture:{midTime:plan.midTime,duration:plan.burn.duration,deltaV:plan.deltaV,periapsis:plan.periapsis}};
}
