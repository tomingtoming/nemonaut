import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {Flight} from '../dist/core.js';import {preset} from '../dist/catalog.js';
import {lunarCapturePlan,captureBurnEstimate,captureNode} from '../dist/lunar-capture.js';
import {saveFlight,loadFlight} from '../dist/flight-save.js';
import {MOON,bodyState,bodyOrbitState} from '../dist/celestial.js';
import {coastDrift} from '../dist/coast-orbit.js';
import {advanceCoastFleet} from '../dist/coast-flight.js';

function arrival(epoch=40000){
 const f=new Flight(preset('orbiter'),'moon-orbit',epoch),moon=bodyState(MOON,epoch);
 const radius=MOON.sphereOfInfluence-5000,rp=700000,e=1.5,p=rp*(1+e),nu=-Math.acos((p/radius-1)/e),h=Math.sqrt(MOON.mu*p);
 const r=new T.Vector3(0,Math.cos(nu),Math.sin(nu)),t=new T.Vector3(0,-Math.sin(nu),Math.cos(nu));
 const v=r.clone().multiplyScalar(MOON.mu/h*e*Math.sin(nu)).addScaledVector(t,h/radius);
 f.pos.copy(moon.position).addScaledVector(r,radius).sub(f.stats.com.clone().applyQuaternion(f.q));f.vel.copy(moon.velocity).add(v);f.orbit=bodyOrbitState(f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),f.vel,epoch);f.stageNext();f.throttle=0;return f;
}

test('Lunar capture predicts a circular orbit at the approaching periapsis without mutation',()=>{
 const f=arrival();try{const before=[f.pos.toArray(),f.vel.toArray(),[...f.fuel]],plan=lunarCapturePlan(f);
  assert.ok(plan.ready,plan.warnings.join(','));assert.ok(plan.deltaV>170&&plan.deltaV<180);
  assert.ok(plan.startTime<plan.midTime);assert.ok(plan.burn.duration>0);
  assert.ok(Math.abs(plan.afterOrbit.periapsis-500000)<1);assert.ok(Math.abs(plan.afterOrbit.apoapsis-500000)<1);
  assert.deepEqual([f.pos.toArray(),f.vel.toArray(),[...f.fuel]],before);
 }finally{f.dispose();}
});

test('Capture rejects wrong body, passed encounter and incompatible propulsion; fuel shortage is explicit',()=>{
 const f=arrival(),outside=new Flight(preset('orbiter'),'orbit');try{
  assert.throws(()=>lunarCapturePlan(outside),/月重力圏/);
  f.throttle=.1;assert.throws(()=>lunarCapturePlan(f),/スロットル/);f.throttle=0;
  const originalVelocity=f.vel.clone(),moon=bodyState(MOON,f.universalTime);f.vel.sub(moon.velocity).negate().add(moon.velocity);assert.throws(()=>lunarCapturePlan(f),/通過済み/);f.vel.copy(originalVelocity);
  for(const id of f.fuel.keys())f.fuel.set(id,1);const poor=lunarCapturePlan(f);assert.equal(poor.ready,false);assert.equal(poor.burn.enough,false);
  f.parts.find(p=>p.type==='engine').r[0]=Math.PI;assert.throws(()=>captureBurnEstimate(f,100),/推力軸/);
 }finally{f.dispose();outside.dispose();}
});

test('Lunar Pathfinder departure, coast and finite capture burn produce a retained lunar orbit',()=>{
 const f=new Flight(preset('orbiter'),'transfer',0);
 try{
  while(f.universalTime<f.transferGuide.startTime-1e-6)f.step(Math.min(1/120,f.transferGuide.startTime-f.universalTime));
  f.stageNext();f.throttle=1;
  while(f.transferGuide.delivered<f.transferGuide.target&&f.time<200){if(f.transferGuide.target-f.transferGuide.delivered<100)f.throttle=.1;f.step(1/120);}
  f.throttle=0;
  while(f.orbit.bodyId!=='moon'&&f.universalTime<40000){const result=advanceCoastFleet(f,1000,{maxSteps:500});if(result.reason)f.step(.5);}
  assert.equal(f.orbit.bodyId,'moon');const plan=lunarCapturePlan(f);assert.ok(plan.ready,plan.warnings.join(','));
  const com=f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),coastTime=plan.startTime-f.universalTime-60,at=coastDrift(com,f.vel,f.universalTime,coastTime);
  f.pos.copy(at.position).sub(f.stats.com.clone().applyQuaternion(f.q));f.vel.copy(at.velocity);f.universalTime+=coastTime;f.time+=coastTime;
  f.maneuver={time:f.time+60,universalTime:plan.startTime,position:plan.position.toArray(),velocity:plan.afterVelocity.toArray(),impulse:plan.impulse.toArray(),remaining:plan.impulse.toArray(),complete:false};f.sas=true;f.sasMode='maneuver';
  while(f.universalTime<plan.startTime-1e-6)f.step(Math.min(1/120,plan.startTime-f.universalTime));
  assert.ok(new T.Vector3(0,1,0).applyQuaternion(f.q).angleTo(plan.impulse)<.02,'SAS must align before burning');f.throttle=1;
  let elapsed=0;while(elapsed<plan.burn.duration){const dt=Math.min(1/120,plan.burn.duration-elapsed);f.step(dt);elapsed+=dt;}
  f.throttle=0;assert.ok(f.orbit.energy<0);assert.ok(f.orbit.periapsis>400000);assert.ok(f.orbit.apoapsis+MOON.radius<MOON.sphereOfInfluence);assert.ok(f.fuelRatio>.5);
  const period=f.orbit.period;const result=advanceCoastFleet(f,period,{maxSteps:10000});assert.equal(result.reason,null);assert.ok(Math.abs(result.advanced-period)<1e-7);assert.equal(f.orbit.bodyId,'moon');assert.ok(f.orbit.energy<0);
 }finally{f.dispose();}
});

test('Reference-duration finite burn in actual Flight captures an inbound lunar hyperbola',()=>{
 for(const epoch of [0,100000]){const f=arrival(epoch);try{
  const plan=lunarCapturePlan(f),com=f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),at=coastDrift(com,f.vel,epoch,plan.startTime-epoch);
  f.q.setFromUnitVectors(new T.Vector3(0,1,0),plan.impulse.clone().normalize());f.pos.copy(at.position).sub(f.stats.com.clone().applyQuaternion(f.q));f.vel.copy(at.velocity);f.universalTime=plan.startTime;f.sas=false;f.throttle=1;
  let elapsed=0;while(elapsed<plan.burn.duration){const dt=Math.min(1/120,plan.burn.duration-elapsed);f.step(dt);elapsed+=dt;}
  f.throttle=0;assert.ok(f.orbit.energy<0);assert.ok(f.orbit.periapsis>450000);assert.ok(f.orbit.apoapsis<550000);assert.equal(f.crashed,false);
 }finally{f.dispose();}}
});

test('Capture start and midpoint persist independently and fast coast stops 60 seconds before start',()=>{
 const f=arrival();let restored;
 try{
  const plan=lunarCapturePlan(f);f.maneuver=captureNode(plan,f);const saved=saveFlight(f);restored=loadFlight(saved);
  assert.equal(restored.maneuver.universalTime,plan.startTime);assert.equal(restored.maneuver.capture.midTime,plan.midTime);
  const result=advanceCoastFleet(restored,10000,{maxSteps:10000});assert.equal(result.reason,'予定噴射の直前');assert.ok(Math.abs(restored.universalTime-(plan.startTime-60))<.01);
  for(const field of ['midTime','duration','deltaV','periapsis']){const bad=structuredClone(saved);bad.maneuver.capture[field]=NaN;assert.throws(()=>loadFlight(bad));}
  const bad=structuredClone(saved);bad.maneuver.capture.midTime+=10;assert.throws(()=>loadFlight(bad));
  assert.throws(()=>captureNode({...plan,ready:false,warnings:['不足']},f),/不足/);
 }finally{restored?.dispose();f.dispose();}
});
