import {closestApproach} from './closest-approach.js';
import {keplerDrift} from './coast-orbit.js';
import type {OrbitState} from './celestial.js';
import type {ManeuverComponents} from './maneuver.js';
/** A single impulsive burn that cancels velocity relative to the target, now or at closest approach. */
export interface RelativeStopPlan{location:'now'|{universalTime:number};time:number;deltaV:number;distance:number;components:ManeuverComponents}

// A single burn on the current coast trajectory, not a second planned node.
export function relativeStopPlan(own:OrbitState,target:OrbitState|null|undefined,when:string='closest'):RelativeStopPlan{
 if(!['closest','now'].includes(when))throw Error('速度合わせの時点を選んでください');
 if(!target||own.bodyId!==target.bodyId||Math.abs(own.universalTime-target.universalTime)>1e-4||own.normal.lengthSq()<.5)throw Error('同じ天体・時刻の機体を選んでください');
 const encounter=when==='closest'?closestApproach(own,target,Math.min(21600,own.period)):null;
 const time=!encounter||encounter.time<5?0:encounter.time;
 const a=keplerDrift(own.r,own.relativeVelocity,own.body.mu,time);
 const b=keplerDrift(target.r,target.relativeVelocity,target.body.mu,time);
 const impulse=b.velocity.clone().sub(a.velocity),deltaV=impulse.length();
 if(deltaV<.5)throw Error('相対速度は既に0.5 m/s未満です');
 if(deltaV>10000)throw Error('必要なΔvが10000 m/sを超えています');
 const p=a.velocity.clone().normalize(),n=a.position.clone().cross(p).normalize(),r=p.clone().cross(n).normalize();
 return {location:time===0?'now':{universalTime:own.universalTime+time},time,deltaV,distance:a.position.distanceTo(b.position),
  components:{prograde:impulse.dot(p),normal:impulse.dot(n),radial:impulse.dot(r)}};
}
