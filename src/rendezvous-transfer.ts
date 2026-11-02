import {lambertArc} from './lambert.js';
import {keplerDrift} from './coast-orbit.js';
import {bodyOrbitState,bodyState,MOON,type OrbitState} from './celestial.js';
export interface RendezvousTransferOptions{duration?:number|'auto';preparation?:number}
export interface RendezvousTransfer{epoch:number;arrivalTime:number;duration:number;deltaV:number;distance:number;arrivalSpeed:number;components:import('./maneuver.js').ManeuverComponents;automatic?:boolean;burn?:undefined}

// One departure impulse. Arrival braking is reported, never silently applied.
export function rendezvousTransfer(own:OrbitState,target:OrbitState|null|undefined,{duration=600,preparation=120}:RendezvousTransferOptions={}):RendezvousTransfer{
 if(!target||own.bodyId!==target.bodyId||Math.abs(own.universalTime-target.universalTime)>1e-4)throw Error('同じ天体・時刻の目標を選んでください');
 if(duration==='auto'){
  if(!Number.isFinite(preparation)||preparation<60||preparation>600||preparation>own.period)throw Error('準備60〜600秒で指定してください');
  let best:RendezvousTransfer|null=null;
  // Search a bounded set of safe zero-revolution arcs. Include arrival braking
  // in the ranking so a cheap departure does not hide an expensive encounter.
  for(let seconds=60;seconds<=7200;seconds+=60){
   try{const candidate=rendezvousTransfer(own,target,{duration:seconds,preparation});
    if(!best||candidate.deltaV+candidate.arrivalSpeed<best.deltaV+best.arrivalSpeed)best=candidate;
   }catch{/* Unsafe/singular arcs are excluded, never relaxed. */}
  }
  if(!best)throw Error('1〜120分の範囲に安全な移送案がありません。軌道面・高度・出発時刻を調整してください');
  return {...best,automatic:true};
 }
 if(!Number.isFinite(duration)||duration<60||duration>7200||!Number.isFinite(preparation)||preparation<60||preparation>600||preparation>own.period)throw Error('準備60〜600秒、飛行60〜7200秒で指定してください');
 const validate=(o:OrbitState)=>{if(!o.stable||o.normal.lengthSq()<.5||o.body.radius+o.apoapsis>=(o.body.sphereOfInfluence??MOON.orbitRadius-MOON.sphereOfInfluence))throw Error('大気や重力圏を横切らない周回軌道が必要です');};
 validate(own);validate(target);
 const epoch=own.universalTime+preparation,arrivalTime=epoch+duration;
 const departure=keplerDrift(own.r,own.relativeVelocity,own.body.mu,preparation),arrival=keplerDrift(target.r,target.relativeVelocity,target.body.mu,preparation+duration);
 // Aim 100 m radially outside the target, not at the target's centre.
 const aim=arrival.position.clone().addScaledVector(arrival.position.clone().normalize(),100);
 const arc=lambertArc(departure.position,aim,duration,own.body.mu,own.normal),impulse=arc.departure.clone().sub(departure.velocity),deltaV=impulse.length();
 if(deltaV<.5||deltaV>10000)throw Error('出発Δvは0.5〜10000 m/sの範囲が必要です');
 const origin=bodyState(own.body,epoch),position=departure.position.clone().add(origin.position),velocity=arc.departure.clone().add(origin.velocity);
 validate(bodyOrbitState(position,velocity,epoch,own.body));
 const p=departure.velocity.clone().normalize(),n=departure.position.clone().cross(p).normalize(),r=p.clone().cross(n).normalize();
 return {epoch,arrivalTime,duration,deltaV,distance:100,arrivalSpeed:arc.arrival.distanceTo(arrival.velocity),components:{prograde:impulse.dot(p),normal:impulse.dot(n),radial:impulse.dot(r)}};
}
