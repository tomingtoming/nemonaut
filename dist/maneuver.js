import {PLANET,center,orbitState} from './planet.js';
import {apsisPlan} from './orbit-plan.js';
// A preview is pure: both inputs and the live vehicle remain untouched.
export function maneuverPreview(pos,vel,location,deltaV){
 if(!Number.isFinite(deltaV)||Math.abs(deltaV)>10000)throw new Error('Δvは−10000〜10000 m/sで入力してください');
 if(!['now','apoapsis','periapsis'].includes(location))throw new Error('噴射地点を選んでください');
 const original=orbitState(pos,vel),plan=apsisPlan(original);let burnPos=pos.clone(),burnVel=vel.clone(),time=0;
 if(location!=='now'){
  const point=plan[location];
  if(!point||!Number.isFinite(point.time))throw new Error('この軌道には指定できる次の遠近点がありません');
  if(original.periapsis<0)throw new Error('地表と交差する軌道では将来の噴射を計画できません');
  const radius=PLANET.radius+point.altitude,direction=original.evec.clone().normalize().multiplyScalar(location==='apoapsis'?-1:1);
  burnPos=direction.clone().multiplyScalar(radius).add(center);
  burnVel=original.normal.clone().cross(direction).multiplyScalar(Math.sqrt(Math.max(0,2*(original.energy+PLANET.mu/radius))));time=point.time;
 }
 if(burnVel.length()<.5)throw new Error('速度が小さすぎるため順行方向を決められません');
 const impulse=burnVel.clone().normalize().multiplyScalar(deltaV),afterVel=burnVel.clone().add(impulse);
 return {original,orbit:orbitState(burnPos,afterVel),burnPos,burnVel,afterVel,impulse,time,deltaV};
}
