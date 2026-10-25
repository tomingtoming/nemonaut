import {bodyOrbitState,bodyState} from './celestial.js';
import {apsisPlan} from './orbit-plan.js';
// A preview is pure: both inputs and the live vehicle remain untouched.
export function maneuverPreview(pos,vel,location,deltaV,universalTime=0){
 if(!Number.isFinite(deltaV)||Math.abs(deltaV)>10000)throw new Error('Δvは−10000〜10000 m/sで入力してください');
 if(!['now','apoapsis','periapsis'].includes(location))throw new Error('噴射地点を選んでください');
 const original=bodyOrbitState(pos,vel,universalTime),body=original.body,plan=apsisPlan(original);let burnPos=pos.clone(),burnVel=vel.clone(),time=0;
 if(location!=='now'){
  const point=plan[location];
  if(!point||!Number.isFinite(point.time))throw new Error('この軌道には指定できる次の遠近点がありません');
  if(original.periapsis<0)throw new Error('地表と交差する軌道では将来の噴射を計画できません');
  const radius=body.radius+point.altitude,direction=original.evec.clone().normalize().multiplyScalar(location==='apoapsis'?-1:1);
  if(body.sphereOfInfluence&&body.radius+original.apoapsis>=body.sphereOfInfluence)throw Error('重力圏を出る軌道の将来噴射は未対応です');
  const future=bodyState(body,universalTime+point.time);burnPos=direction.clone().multiplyScalar(radius).add(future.position);
  burnVel=original.normal.clone().cross(direction).multiplyScalar(Math.sqrt(Math.max(0,2*(original.energy+body.mu/radius))));burnVel.add(future.velocity);time=point.time;
 }
 const relativeVelocity=burnVel.clone().sub(bodyState(body,universalTime+time).velocity);if(relativeVelocity.length()<.5)throw new Error('速度が小さすぎるため順行方向を決められません');
 const impulse=relativeVelocity.normalize().multiplyScalar(deltaV),afterVel=burnVel.clone().add(impulse);
 return {original,orbit:bodyOrbitState(burnPos,afterVel,universalTime+time,body),universalTime:universalTime+time,burnPos,burnVel,afterVel,impulse,time,deltaV};
}
