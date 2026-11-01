import {keplerDrift} from './coast-orbit.js';
import {MOON,bodyState,bodyOrbitState} from './celestial.js';
// Snapshot search of simultaneous positions. No burns, drag, or SOI transitions.
export function closestApproach(a,b,searchHorizon=null){
 if(!b||a.bodyId!==b.bodyId||Math.abs(a.universalTime-b.universalTime)>1e-4)throw Error('同じ天体・時刻の軌道を選んでください');
 for(const o of [a,b]){if(!Number.isFinite(o.period)||o.periapsis<=o.body.atmosphereTop||o.normal.lengthSq()<.5)throw Error('大気・地表を横切らない周回軌道が必要です');const max=o.body.radius+o.apoapsis;if(max>=(o.body.sphereOfInfluence??MOON.orbitRadius-MOON.sphereOfInfluence))throw Error('重力圏の移行を含む接近予測は未対応です');}
 const horizon=searchHorizon??Math.min(21600,Math.max(a.period,b.period));if(!Number.isFinite(horizon)||horizon<=0||horizon>21600)throw Error('探索期間は6時間以内です');const steps=512,dt=horizon/steps;
 const at=t=>{const x=keplerDrift(a.r,a.relativeVelocity,a.body.mu,t),y=keplerDrift(b.r,b.relativeVelocity,b.body.mu,t);return {t,x,y,d:x.position.distanceToSquared(y.position)};};
 const earlierMinimum=(x,y)=>{const difference=Math.sqrt(y.d)-Math.sqrt(x.d);return difference<-.001||(Math.abs(difference)<=.001&&y.t<x.t)?y:x;};
 const samples=Array.from({length:steps+1},(_,i)=>at(i*dt));let best=samples.reduce(earlierMinimum);
 for(let i=1;i<steps;i++){if(samples[i].d>samples[i-1].d||samples[i].d>samples[i+1].d)continue;let lo=(i-1)*dt,hi=(i+1)*dt;for(let j=0;j<48;j++){const l=lo+(hi-lo)/3,r=hi-(hi-lo)/3;if(at(l).d<at(r).d)hi=r;else lo=l;}const candidate=at((lo+hi)/2);best=earlierMinimum(best,candidate);}
 const epoch=a.universalTime+best.t,origin=bodyState(a.body,epoch).position;
 return {epoch,computedAt:a.universalTime,horizon,time:best.t,distance:Math.sqrt(best.d),speed:best.x.velocity.distanceTo(best.y.velocity),own:best.x.position.add(origin),target:best.y.position.add(origin)};
}

// Compare both alternatives over the SAME interval, starting at the burn.
export function maneuverApproach(preview,target){
 if(!preview?.burnVel||!preview.original||!target)throw Error('目標と編集中のマニューバが必要です');
 const original=preview.original,epoch=preview.orbit.universalTime,delay=epoch-original.universalTime;
 if(!Number.isFinite(delay)||delay<0||delay>21600||original.bodyId!==target.bodyId||Math.abs(original.universalTime-target.universalTime)>1e-4)throw Error('同じ天体で6時間以内の将来噴射を選んでください');
 // Validate the pre-burn coast as well as both post-burn alternatives.
 for(const o of [original,target]){if(!o.stable||o.body.radius+o.apoapsis>=(o.body.sphereOfInfluence??MOON.orbitRadius-MOON.sphereOfInfluence))throw Error('大気・重力圏の移行を含む計画は比較できません');}
 const future=bodyState(target.body,epoch),coast=keplerDrift(target.r,target.relativeVelocity,target.body.mu,delay);
 const targetAtBurn=bodyOrbitState(coast.position.add(future.position),coast.velocity.add(future.velocity),epoch,target.body);
 const baseline=bodyOrbitState(preview.burnPos,preview.burnVel,epoch,original.body);
 const horizon=Math.min(21600,Math.max(baseline.period,targetAtBurn.period,preview.orbit.period));
 return {baseline:closestApproach(baseline,targetAtBurn,horizon),planned:closestApproach(preview.orbit,targetAtBurn,horizon),delay};
}
