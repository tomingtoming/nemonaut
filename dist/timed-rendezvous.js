import {rendezvousTransfer} from './rendezvous-transfer.js';
import {captureBurnEstimate} from './lunar-capture.js';
import {engineBurn} from './resources.js';
import {bodyOrbitState,bodyState} from './celestial.js';
import {maneuverPreview} from './maneuver.js';
import {coastDrift} from './coast-orbit.js';
import {relativeStopPlan} from './relative-stop-plan.js';

export const transferThrottle=remaining=>remaining<.5?.01:remaining<2?.1:1;
// Weight time by delivered delta-v: a long low-throttle tail is not half the burn.
export function transferBurnTiming(vessel,deltaV,{burnThrottle=null}={}){
 if(burnThrottle!==null&&(!Number.isFinite(burnThrottle)||burnThrottle<=0||burnThrottle>1))throw Error('噴射推力は0より大きく100%以下にしてください');
 if(vessel.throttle!==0)throw Error('噴射を停止してから補正してください');
 const estimate=captureBurnEstimate(vessel,deltaV);if(!estimate.enough)throw Error('点火段の燃料が不足しています');
 const fuel=new Map(vessel.fuel),sum=m=>[...m.values()].reduce((a,b)=>a+b,0);let mass=vessel.stats.mass,time=0,delivered=0,moment=0;
 for(let i=0;i<144000&&deltaV-delivered>=.05;i++){
  const dt=1/120,before=sum(fuel),force=sum(engineBurn(vessel.networks,fuel,vessel.active,burnThrottle??transferThrottle(deltaV-delivered),0,dt));
  if(force<=0)throw Error('噴射を継続できません');
  const increment=force*dt/mass;moment+=increment*(time+dt/2);delivered+=increment;mass-=before-sum(fuel);time+=dt;
 }
 if(deltaV-delivered>=.05)throw Error('噴射が長すぎます');
 return {duration:time,offset:moment/delivered,delivered,burnThrottle};
}
export function timedRendezvousTransfer(vessel,target,options={}){
 const position=vessel.pos.clone().add(vessel.stats.com.clone().applyQuaternion(vessel.q)),own=bodyOrbitState(position,vessel.vel,vessel.universalTime);
 const plan=rendezvousTransfer(own,target,options),preview=maneuverPreview(position,vessel.vel,{universalTime:plan.epoch},plan.components,vessel.universalTime),burn=transferBurnTiming(vessel,plan.deltaV,options),epoch=plan.epoch-burn.offset;
 if(epoch-vessel.universalTime<60||burn.duration>own.period*.05)throw Error('整列時間または短時間噴射の条件を満たしません');
 const at=coastDrift(position,vessel.vel,vessel.universalTime,epoch-vessel.universalTime),origin=bodyState(own.body,epoch),p=at.velocity.clone().sub(origin.velocity).normalize(),n=at.position.clone().sub(origin.position).cross(p).normalize(),r=p.clone().cross(n).normalize();
 return {...plan,impulseEpoch:plan.epoch,epoch,burn,components:{prograde:preview.impulse.dot(p),normal:preview.impulse.dot(n),radial:preview.impulse.dot(r)}};
}

export function timedRelativeStopPlan(vessel,target,options={}){
 const position=vessel.pos.clone().add(vessel.stats.com.clone().applyQuaternion(vessel.q)),own=bodyOrbitState(position,vessel.vel,vessel.universalTime),plan=relativeStopPlan(own,target);
 if(plan.location==='now')throw Error('補正には最接近まで60秒以上の準備時間が必要です');
 const preview=maneuverPreview(position,vessel.vel,plan.location,plan.components,vessel.universalTime),burn=transferBurnTiming(vessel,plan.deltaV,options),epoch=plan.location.universalTime-burn.offset;
 if(epoch-vessel.universalTime<60||burn.duration>own.period*.05)throw Error('整列時間または短時間噴射の条件を満たしません');
 const at=coastDrift(position,vessel.vel,vessel.universalTime,epoch-vessel.universalTime),origin=bodyState(own.body,epoch),p=at.velocity.clone().sub(origin.velocity).normalize(),n=at.position.clone().sub(origin.position).cross(p).normalize(),r=p.clone().cross(n).normalize();
 return {...plan,location:{universalTime:epoch},time:epoch-vessel.universalTime,burn,components:{prograde:preview.impulse.dot(p),normal:preview.impulse.dot(n),radial:preview.impulse.dot(r)}};
}
