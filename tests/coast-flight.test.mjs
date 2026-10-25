import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {advanceCoastFleet,coastEligibility,coolVacuum,isParked,coolStationary} from '../dist/coast-flight.js';
import {atmosphere} from '../dist/planet.js';
import {thermalStep,createThermal} from '../dist/thermal.js';
import {saveFlight,loadFlight} from '../dist/flight-save.js';
import {selectVessel,fleet} from '../dist/fleet.js';

const center=f=>f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));

test('Coast matches nonrotating unpowered Flight with SAS off, including energy and cooling',()=>{
 const f=new Flight(preset('orbiter'),'moon-orbit',40000);let slow;
 try{
  f.sas=false;for(const id of f.charge.keys())f.charge.set(id,0);
  slow=loadFlight(saveFlight(f));const fuel=[...f.fuel];
  const result=advanceCoastFleet(f,120);assert.equal(result.advanced,120);assert.equal(result.reason,null);
  for(let i=0;i<14400;i++)slow.step(1/120);
  assert.ok(center(f).distanceTo(center(slow))<.1);
  assert.ok(f.vel.distanceTo(slow.vel)<.01);
  assert.ok(f.q.angleTo(slow.q)<.001);
  for(const [id,s] of f.thermal)assert.ok(Math.abs(s.temperature-slow.thermal.get(id).temperature)<.1);
  for(const [id,n] of f.charge)assert.ok(Math.abs(n-slow.charge.get(id))<1);
  assert.deepEqual([...f.fuel],fuel);assert.equal(f.universalTime,40120);
 }finally{slow?.dispose();f.dispose();}
});

test('Coast shares UT with retained vessels and survives saving and switching control',()=>{
 let a=new Flight(preset('orbiter'),'orbit',100);const b=new Flight(preset('orbiter'),'moon-orbit',100);let restored;
 try{
  // Give the independently constructed craft unique part IDs, as launch does.
  for(const p of b.parts){const old=p.id;p.id='moon-'+old;if(p.parent)p.parent='moon-'+p.parent;for(const map of [b.fuel,b.charge,b.thermal])if(map.has(old)){map.set(p.id,map.get(old));map.delete(old);}}
  a.detached.push(b);const result=advanceCoastFleet(a,60);assert.equal(result.advanced,60);
  assert.ok(fleet(a).every(v=>v.universalTime===160&&v.time===60));
  restored=loadFlight(saveFlight(a));restored=selectVessel(restored,restored.detached[0]);
  assert.equal(advanceCoastFleet(restored,10).advanced,10);assert.ok(fleet(restored).every(v=>v.universalTime===170));
  restored.step(1/120);assert.ok(fleet(restored).every(v=>v.universalTime===restored.universalTime));
 }finally{restored?.dispose();a.dispose();}
});

test('Coast rejects thrust, input and unsafe fleet members without partial mutation',()=>{
 const a=new Flight(preset('orbiter'),'orbit'),b=new Flight(preset('rocket'),'land');
 try{
  a.detached.push(b);const before=saveFlight(a);
  assert.equal(advanceCoastFleet(a,100).advanced,0);assert.deepEqual(saveFlight(a),before);
  a.detached=[];a.throttle=.1;assert.equal(coastEligibility(a),'推力設定のある機体');
  a.throttle=0;assert.equal(advanceCoastFleet(a,10,{input:true}).advanced,0);
  assert.equal(a.universalTime,0);
 }finally{a.dispose();b.dispose();}
});

test('Burn deadline stops 15 seconds early and bounded work leaves a remaining duration',()=>{
 const f=new Flight(preset('orbiter'),'transfer',100);
 try{
  const q=f.q.clone(),omega=new T.Vector3(.003,.005,-.002);f.omega.copy(omega);
  const first=advanceCoastFleet(f,100,{maxSteps:2});assert.equal(first.steps,2);assert.ok(first.advanced>0&&first.advanced<=10);assert.equal(first.remaining,100-first.advanced);
  assert.deepEqual(f.q.toArray(),q.toArray());assert.deepEqual(f.omega.toArray(),omega.toArray());
  const second=advanceCoastFleet(f,100);assert.equal(f.universalTime,145);assert.equal(second.reason,'予定噴射の直前');assert.equal(f.transferGuide.delivered,0);
 }finally{f.dispose();}
});

test('Vacuum cooling preserves ablator and approaches short-step radiation for hot parts',()=>{
 const parts=preset('orbiter'),fast=createThermal(parts),slow=createThermal(parts);
 for(const states of [fast,slow])for(const s of states.values())s.temperature=1000;
 const fuel=[...fast].map(([id,s])=>[id,s.ablator]);coolVacuum(parts,fast,300);
 for(let i=0;i<6000;i++)thermalStep(parts,slow,new T.Quaternion(),new T.Vector3(),{density:0,pressure:0,temperature:3},.05);
 for(const [id,s] of fast)assert.ok(Math.abs(s.temperature-slow.get(id).temperature)<.5);
 assert.deepEqual([...fast].map(([id,s])=>[id,s.ablator]),fuel);
});

test('A settled ground vehicle remains on the surface while an orbital fleet advances',()=>{
 const ground=new Flight(preset('rover'),'land');let orbit;
 try{
  for(let i=0;i<1200;i++)ground.step(1/120);
  assert.ok(isParked(ground),'actual ground physics must establish parking');
  orbit=new Flight(preset('orbiter'),'orbit',ground.universalTime);orbit.detached.push(ground);
  const p=ground.pos.clone(),q=ground.q.clone(),fuel=[...ground.fuel],time=ground.time;
  const result=advanceCoastFleet(orbit,300,{maxSteps:200});assert.equal(result.advanced,300);assert.equal(result.reason,null);
  assert.ok(ground.pos.distanceTo(p)<1e-8);assert.deepEqual(ground.q.toArray(),q.toArray());assert.deepEqual([...ground.fuel],fuel);
  assert.ok(ground.landed);assert.ok(Math.abs(ground.time-time-300)<1e-8);assert.equal(ground.universalTime,orbit.universalTime);
  ground.vel.x=1;assert.equal(isParked(ground),false);assert.equal(advanceCoastFleet(orbit,10).advanced,0);
 }finally{if(orbit)orbit.dispose();else ground.dispose();}
});

test('Stationary atmosphere cooling matches the normal thermal model without freezing temperature',()=>{
 const parts=preset('orbiter'),fast=createThermal(parts),slow=createThermal(parts),air=atmosphere(0);
 for(const states of [fast,slow])for(const s of states.values())s.temperature=500;
 coolStationary(parts,fast,300,air);
 for(let i=0;i<6000;i++)thermalStep(parts,slow,new T.Quaternion(),new T.Vector3(),air,.05);
 for(const [id,s] of fast){assert.ok(s.temperature<500);assert.ok(s.temperature>=air.temperature);assert.ok(Math.abs(s.temperature-slow.get(id).temperature)<.5);}
});
