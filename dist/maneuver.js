import {coastDrift} from './coast-orbit.js';
import {bodyOrbitState,bodyState} from './celestial.js';
import {apsisPlan} from './orbit-plan.js';
// A preview is pure: both inputs and the live vehicle remain untouched.
export function maneuverPreview(pos,vel,location,deltaV,universalTime=0){
 const components=typeof deltaV==='number'?{prograde:deltaV,normal:0,radial:0}:deltaV;
 if(!components||!['prograde','normal','radial'].every(k=>Number.isFinite(components[k]))||Math.hypot(components.prograde,components.normal,components.radial)>10000)throw new Error('合計Δvは10000 m/s以内で入力してください');
 const custom=location&&typeof location==='object';
 if(!custom&&!['now','apoapsis','periapsis'].includes(location))throw new Error('噴射地点を選んでください');
 const original=bodyOrbitState(pos,vel,universalTime),body=original.body,plan=apsisPlan(original);let burnPos=pos.clone(),burnVel=vel.clone(),time=0;
 if(custom){
  time=location.universalTime-universalTime;
  if(!Number.isFinite(time)||time<0||time>original.period||original.energy>=0||original.periapsis<0)throw Error('この時刻に将来の噴射を計画できません');
  if(body.sphereOfInfluence&&body.radius+original.apoapsis>=body.sphereOfInfluence)throw Error('重力圏を出る軌道の将来噴射は未対応です');
  const next=coastDrift(pos,vel,universalTime,time);burnPos=next.position;burnVel=next.velocity;
 }else if(location!=='now'){
  const point=plan[location];
  if(!point||!Number.isFinite(point.time))throw new Error('この軌道には指定できる次の遠近点がありません');
  if(original.periapsis<0)throw new Error('地表と交差する軌道では将来の噴射を計画できません');
  const radius=body.radius+point.altitude,direction=original.evec.clone().normalize().multiplyScalar(location==='apoapsis'?-1:1);
  if(body.sphereOfInfluence&&body.radius+original.apoapsis>=body.sphereOfInfluence)throw Error('重力圏を出る軌道の将来噴射は未対応です');
  const future=bodyState(body,universalTime+point.time);burnPos=direction.clone().multiplyScalar(radius).add(future.position);
  burnVel=original.normal.clone().cross(direction).multiplyScalar(Math.sqrt(Math.max(0,2*(original.energy+body.mu/radius))));burnVel.add(future.velocity);time=point.time;
 }
 const relativeVelocity=burnVel.clone().sub(bodyState(body,universalTime+time).velocity);if(relativeVelocity.length()<.5)throw new Error('速度が小さすぎるため順行方向を決められません');
 const prograde=relativeVelocity.normalize(),radius=burnPos.clone().sub(bodyState(body,universalTime+time).position),normal=radius.clone().cross(prograde);
 if((components.normal||components.radial)&&normal.lengthSq()<1e-8)throw Error('半径方向の飛行では軌道面方向を決められません');
 normal.normalize();const radial=prograde.clone().cross(normal).normalize();
 const impulse=prograde.multiplyScalar(components.prograde).addScaledVector(normal,components.normal).addScaledVector(radial,components.radial),afterVel=burnVel.clone().add(impulse);
 deltaV=typeof deltaV==='number'?deltaV:impulse.length();
 return {original,orbit:bodyOrbitState(burnPos,afterVel,universalTime+time,body),universalTime:universalTime+time,burnPos,burnVel,afterVel,impulse,time,deltaV};
}

// Next passage through a point on the current elliptical conic, including circles.
export function mapPointEpoch(o,point){
 if(o.energy>=0||o.periapsis<0||o.normal.lengthSq()<.5||!Number.isFinite(o.period))throw Error('周回軌道上で噴射地点を選んでください');
 const axis=o.eccentricity>1e-7?o.evec.clone().normalize():o.r.clone().normalize(),side=o.normal.clone().cross(axis),e=o.eccentricity;
 const mean=r=>{const a=Math.atan2(r.dot(side),r.dot(axis)),E=2*Math.atan2(Math.sqrt(1-e)*Math.sin(a/2),Math.sqrt(1+e)*Math.cos(a/2));return E-e*Math.sin(E);};
 const angle=((mean(point.clone().sub(o.center))-mean(o.r))%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
 return o.universalTime+angle/(2*Math.PI)*o.period;
}
