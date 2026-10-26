import {keplerDrift} from './coast-orbit.js';
import {MOON,bodyState} from './celestial.js';
// Snapshot search of simultaneous positions. No burns, drag, or SOI transitions.
export function closestApproach(a,b){
 if(!b||a.bodyId!==b.bodyId||Math.abs(a.universalTime-b.universalTime)>1e-4)throw Error('同じ天体・時刻の軌道を選んでください');
 for(const o of [a,b]){if(!Number.isFinite(o.period)||o.periapsis<=o.body.atmosphereTop||o.normal.lengthSq()<.5)throw Error('大気・地表を横切らない周回軌道が必要です');const max=o.body.radius+o.apoapsis;if(max>=(o.body.sphereOfInfluence??MOON.orbitRadius-MOON.sphereOfInfluence))throw Error('重力圏の移行を含む接近予測は未対応です');}
 const horizon=Math.min(21600,Math.max(a.period,b.period)),steps=512,dt=horizon/steps;
 const at=t=>{const x=keplerDrift(a.r,a.relativeVelocity,a.body.mu,t),y=keplerDrift(b.r,b.relativeVelocity,b.body.mu,t);return {t,x,y,d:x.position.distanceToSquared(y.position)};};
 const samples=Array.from({length:steps+1},(_,i)=>at(i*dt));let best=samples.reduce((x,y)=>x.d<=y.d?x:y);
 for(let i=1;i<steps;i++){if(samples[i].d>samples[i-1].d||samples[i].d>samples[i+1].d)continue;let lo=(i-1)*dt,hi=(i+1)*dt;for(let j=0;j<48;j++){const l=lo+(hi-lo)/3,r=hi-(hi-lo)/3;if(at(l).d<at(r).d)hi=r;else lo=l;}const candidate=at((lo+hi)/2);const difference=Math.sqrt(candidate.d)-Math.sqrt(best.d);if(difference<-.001||(Math.abs(difference)<=.001&&candidate.t<best.t))best=candidate;}
 const epoch=a.universalTime+best.t,origin=bodyState(a.body,epoch).position;
 return {epoch,computedAt:a.universalTime,horizon,time:best.t,distance:Math.sqrt(best.d),speed:best.x.velocity.distanceTo(best.y.velocity),own:best.x.position.add(origin),target:best.y.position.add(origin)};
}
