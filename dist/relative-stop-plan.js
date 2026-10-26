import {closestApproach} from './closest-approach.js';
import {keplerDrift} from './coast-orbit.js';

// A single burn on the current coast trajectory, not a second planned node.
export function relativeStopPlan(own,target){
 const encounter=closestApproach(own,target,Math.min(21600,own.period));
 const time=encounter.time<5?0:encounter.time;
 const a=keplerDrift(own.r,own.relativeVelocity,own.body.mu,time);
 const b=keplerDrift(target.r,target.relativeVelocity,target.body.mu,time);
 const impulse=b.velocity.clone().sub(a.velocity),deltaV=impulse.length();
 if(deltaV<.5)throw Error('相対速度は既に0.5 m/s未満です');
 if(deltaV>10000)throw Error('必要なΔvが10000 m/sを超えています');
 const p=a.velocity.clone().normalize(),n=a.position.clone().cross(p).normalize(),r=p.clone().cross(n).normalize();
 return {location:time===0?'now':{universalTime:own.universalTime+time},time,deltaV,distance:a.position.distanceTo(b.position),
  components:{prograde:impulse.dot(p),normal:impulse.dot(n),radial:impulse.dot(r)}};
}
