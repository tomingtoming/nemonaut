import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Flight} from '../dist/core.js';
import {part,preset} from '../dist/catalog.js';
import {saveFlight,loadFlight} from '../dist/flight-save.js';
import {deliverySitePosition,DELIVERY_SITE} from '../dist/delivery-sites.js';
import {PRIMARY} from '../dist/celestial.js';
import {surfaceOrientation,surfaceVelocity,surfaceAngularVelocity,PRIMARY_ROTATION_PERIOD} from '../dist/surface-frame.js';
import {powerTotals} from '../dist/power.js';
import {observationReason,observationStatus} from '../dist/observation.js';
import {setPartAction} from '../dist/part-actions.js';
import {advanceCoastFleet,isParked} from '../dist/coast-flight.js';
import {dockVessels,undockVessel} from '../dist/docking.js';
function station(time=PRIMARY_ROTATION_PERIOD/2){
 const probe=part('probe'),solar=part('solar',[0,.3,0],[-Math.PI/2,0,0],probe.id);
 const f=new Flight([probe,solar],'land',time);f.sas=false;f.reactionEnabled=false;
 f.q.copy(surfaceOrientation(time)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),-DELIVERY_SITE.north/PRIMARY.radius));
 f.pos.copy(deliverySitePosition(time)).add(new T.Vector3(0,.205,0).applyQuaternion(f.q));f.vel.copy(surfaceVelocity(f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),time));f.omega.copy(surfaceAngularVelocity());
 for(let i=0;i<240;i++)f.step(1/120);return f;
}
test('Observation is opt-in, consumes real energy, and gives matching normal/coast progress at night',()=>{
 const f=station();let fast;try{
  const id=f.parts[0].id;assert.ok(isParked(f));assert.equal(powerTotals(f.parts,f.charge).stored,200);assert.equal(observationReason(f,id),'停止中');
  assert.ok(setPartAction(f,id,'observation',true));assert.equal(observationReason(f,id),'');fast=loadFlight(saveFlight(f));
  for(let i=0;i<7200;i++)f.step(1/120);const result=advanceCoastFleet(fast,60);assert.equal(result.reason,null);
  for(const v of [f,fast]){const s=v.observations.get(id);assert.ok(Math.abs(s.night-60)<.05,JSON.stringify({state:s,reason:observationReason(v,id),landed:v.landed,pos:v.pos.toArray()}));assert.equal(s.day,0);assert.ok(Math.abs(powerTotals(v.parts,v.charge).stored-194)<.01);}
  setPartAction(f,id,'observation',false);const saved=f.observations.get(id).night;for(let i=0;i<120;i++)f.step(1/120);assert.equal(f.observations.get(id).night,saved);
 }finally{f.dispose();fast?.dispose();}
});
test('Depletion limits data to supplied energy; invalid location/flight never earns data',()=>{
 const f=station();try{const id=f.parts[0].id;setPartAction(f,id,'observation',true);f.charge.set(id,.05);
  const r=advanceCoastFleet(f,5);assert.equal(r.reason,null);assert.ok(Math.abs(f.observations.get(id).night-.5)<1e-8);assert.equal(powerTotals(f.parts,f.charge).stored,0);
  advanceCoastFleet(f,5);assert.ok(Math.abs(f.observations.get(id).night-.5)<1e-8);
  f.pos.x+=100;assert.equal(observationReason(f,id),'北観測点の範囲外');const before=f.observations.get(id).night;f.charge.set(id,20);advanceCoastFleet(f,5);assert.equal(f.observations.get(id).night,before);f.pos.x-=100;f.landed=false;assert.equal(observationReason(f,id),'接地・静止待ち');
 }finally{f.dispose();}
});
test('Observation data follows parts through separation, save/restore and docking without aliasing',()=>{
 let f=new Flight(preset('twin'),'orbit');const ids=[...f.observations.keys()];ids.forEach((id,i)=>f.observations.set(id,{enabled:true,day:i+4,night:i+9}));
 f.stageNext();f.stageNext();assert.equal(f.observations.size,1);assert.equal(f.detached[0].observations.size,1);const restored=loadFlight(saveFlight(f));
 assert.deepEqual([...restored.detached[0].observations],[...f.detached[0].observations]);restored.detached[0].observations.get(ids[1]).day=999;assert.notEqual(f.detached[0].observations.get(ids[1]).day,999);f.dispose();restored.dispose();
 f=new Flight(preset('docking'),'orbit');const values=[...f.observations.keys()].map((id,i)=>[id,{enabled:true,day:10+i,night:20+i}]);f.observations=new Map(values);const port=f.parts.find(p=>p.dockPartner);f=undockVessel(f,port.id);const child=f.detached[0],a=f.parts.find(p=>p.type==='dockingPort'),b=child.parts.find(p=>p.type==='dockingPort');f=dockVessels(f,child,a.id,b.id);assert.deepEqual([...f.observations].sort(),values.sort());f.dispose();
});
test('Legacy saves start disabled with no invented data; malformed observation saves are rejected',()=>{
 const f=station();try{
  const old=saveFlight(f);delete old.observations;const loaded=loadFlight(old);assert.deepEqual([...loaded.observations.values()],[{enabled:false,day:0,night:0}]);loaded.dispose();
  for(const mutate of [s=>s.observations=[],s=>s.observations[0][1].day=-1,s=>s.observations[0][1].night=NaN,s=>s.observations[0][1].enabled=1,s=>s.observations[0][0]='unknown',s=>s.observations.push(s.observations[0])]){const bad=saveFlight(f);mutate(bad);assert.throws(()=>loadFlight(bad));}
 }finally{f.dispose();}
});
test('Sunlit observations are separate from night data and can be supplied by solar generation',()=>{
 const f=station(0);try{const id=f.parts[0].id;setPartAction(f,id,'observation',true);f.charge.set(id,0);const r=advanceCoastFleet(f,30);assert.equal(r.reason,null);assert.ok(Math.abs(f.observations.get(id).day-30)<1e-8);assert.equal(f.observations.get(id).night,0);assert.ok(f.charge.get(id)>0);}finally{f.dispose();}
});

test('Observation status distinguishes paused saves, real partial supply, depletion and invalid placement',()=>{
 const f=station();try{
  const id=f.parts[0].id;assert.equal(observationStatus(f,id),'停止中');
  setPartAction(f,id,'observation',true);
  assert.equal(observationStatus(saveFlight(f),id,{paused:true}),'観測ON · 時間停止中');
  advanceCoastFleet(f,5);assert.equal(observationStatus(f,id),'夜間を観測中');
  f.charge.set(id,.05);advanceCoastFleet(f,5);assert.equal(observationStatus(f,id),'電力不足 · 夜間 10%で観測');
  advanceCoastFleet(f,5);assert.equal(observationStatus(f,id),'電力不足 · 観測停止');
  f.pos.x+=100;assert.equal(observationStatus(f,id),'北観測点の範囲外');
  f.crashed=true;assert.equal(observationStatus(f,id),'機体損傷');
 }finally{f.dispose();}
});
