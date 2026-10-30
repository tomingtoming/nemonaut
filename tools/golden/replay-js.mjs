import assert from 'node:assert/strict';
import {loadFlight,saveFlight} from '../../dist/flight-save.js';
import {fleet,canControl} from '../../dist/fleet.js';
import {WorldRuntime} from '../../dist/world-runtime.js';
import {VESSEL_COLLISION} from '../../dist/vessel-collision.js';
export function snapshot(f,labels,tick){
 const key=v=>v.parts.map(p=>labels.get(p.id)).sort().join(',');
 const vessels=fleet(f).map(v=>({key:key(v),parts:v.parts.map(p=>({id:labels.get(p.id),type:p.type,parent:p.parent?labels.get(p.parent):null})).sort((a,b)=>a.id.localeCompare(b.id)),
  state:{stage:v.stage,crashed:v.crashed,landed:v.landed,controllable:canControl(v),wreck:v.failureDynamics},
  time:v.universalTime,position:v.pos.clone().add(v.stats.com.clone().applyQuaternion(v.q)).toArray(),velocity:v.vel.toArray(),quaternion:v.q.toArray(),angularVelocity:v.omega.toArray(),
  resources:v.parts.map(p=>({id:labels.get(p.id),fuel:v.fuel.get(p.id)??0,charge:v.charge.get(p.id)??0,temperature:v.thermal.get(p.id)?.temperature??0,ablator:v.thermal.get(p.id)?.ablator??0})).sort((a,b)=>a.id.localeCompare(b.id))})).sort((a,b)=>a.key.localeCompare(b.key));
 const events=[...new Map(fleet(f).flatMap(v=>v.failureEvents).map(e=>[e.id,e])).values()].map(e=>({part:labels.get(e.partId),cause:e.cause,effect:e.effect,time:e.time,fuel:e.fuel})).sort((a,b)=>a.time-b.time||a.part.localeCompare(b.part));
 return {tick,vessels,events};
}
function invariants(f,labels,previousFuel){
 const ships=fleet(f),all=ships.flatMap(v=>v.parts),ids=all.map(p=>p.id);
 assert.equal(new Set(ids).size,labels.size,'no part duplication or loss');assert.equal(ids.length,labels.size);
 for(const id of ids)assert.ok(labels.has(id),'unknown part');
 let fuel=0;
 for(const v of ships){
  assert.equal(v.universalTime,f.universalTime,'common world clock');
  for(const n of [...v.pos,...v.vel,...v.q,...v.omega])assert.ok(Number.isFinite(n),'nonfinite physics state');
  for(const n of v.fuel.values()){assert.ok(n>=0&&Number.isFinite(n));fuel+=n;}
  for(const s of v.thermal.values()){assert.ok(Number.isFinite(s.temperature)&&s.temperature>=3);if(!v.crashed)assert.equal(s.failed,false);}
 }
 assert.ok(fuel<=previousFuel+1e-7,'propellant created');return fuel;
}
export function replay(scenario){
 // v1/v2 were recorded before vessel-vessel collision existed; only v3 scenarios enable it.
 const collision=VESSEL_COLLISION.enabled;VESSEL_COLLISION.enabled=scenario.vesselCollision===true;
 let f=loadFlight(scenario.initial),world=new WorldRuntime(f),input={};const ids=fleet(f).flatMap(v=>v.parts.map(p=>p.id)),labels=new Map(ids.map((id,i)=>[id,'p'+String(i).padStart(3,'0')]));
 let previousFuel=Infinity;const samples=[],at=new Set(scenario.checkpoints);
 try{
  for(let tick=0;tick<=scenario.ticks;tick++){
   previousFuel=invariants(f,labels,previousFuel);if(at.has(tick))samples.push(snapshot(f,labels,tick));if(tick===scenario.ticks)break;
   for(const a of scenario.actions.filter(a=>a.tick===tick)){
    if(a.kind==='stage'){f.stageNext();world.replace(f);}
    else if(a.kind==='input')input={...a.value};
    else if(a.kind==='set')Object.assign(f,a.value);
    else if(a.kind==='restore'){const restored=loadFlight(saveFlight(f));f.dispose();f=restored;world=new WorldRuntime(f);}
    else throw Error('Unknown recorded action '+a.kind);
   }
   world.step(scenario.dt,input);
  }
  return {name:scenario.name,mode:scenario.mode,samples};
 }finally{f.dispose();VESSEL_COLLISION.enabled=collision;}
}
