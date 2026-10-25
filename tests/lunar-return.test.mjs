import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {Flight,statistics} from '../dist/core.js';import {preset} from '../dist/catalog.js';
import {lunarReturnPlan,lunarReturnNode} from '../dist/lunar-return.js';import {advanceCoastFleet} from '../dist/coast-flight.js';
import {saveFlight,loadFlight} from '../dist/flight-save.js';

test('Return start and impulse epoch survive saves and coast stops sixty seconds before the burn',()=>{
 const f=new Flight(preset('lander'),'moon-orbit',40000);let restored;
 try{f.stageNext();const p=lunarReturnPlan(f);f.maneuver=lunarReturnNode(p,f);f.sasMode='maneuver';
  const save=saveFlight(f);restored=loadFlight(save);assert.deepEqual(restored.maneuver,f.maneuver);
  for(const key of ['midTime','duration','deltaV','predictedPeriapsis','exitTime']){const bad=structuredClone(save);bad.maneuver.returnPlan[key]=-1;assert.throws(()=>loadFlight(bad));}
  const result=advanceCoastFleet(restored,10000,{maxSteps:10000});assert.ok(result.reason);assert.ok(restored.universalTime<=p.startTime-59.9);assert.ok(restored.universalTime>=p.startTime-61);
  assert.throws(()=>lunarReturnNode(p,restored),/再計算/);
 }finally{restored?.dispose();f.dispose();}
});

test('Lunar return search predicts finite burn and a parent-atmosphere approach without mutation',()=>{
 for(const epoch of [0,40000,100000]){const f=new Flight(preset('lander'),'moon-orbit',epoch);try{
  f.stageNext();const pos=f.pos.clone(),vel=f.vel.clone(),fuel=[...f.fuel],p=lunarReturnPlan(f);
  assert.ok(p.ready,p.warnings.join(' / '));assert.ok(p.startTime-epoch>=60);assert.ok(p.deltaV>200&&p.deltaV<1000);
  assert.ok(Math.abs(p.exit.orbit.periapsis-35000)<100);assert.ok(p.finite.exit.orbit.periapsis>10000&&p.finite.exit.orbit.periapsis<70000);
  assert.equal(p.finite.exit.orbit.bodyId,'planet');assert.ok(f.pos.equals(pos));assert.ok(f.vel.equals(vel));assert.deepEqual([...f.fuel],fuel);
 }finally{f.dispose();}}
});

test('Actual finite return burn escapes the moon and stops coast before the parent atmosphere',()=>{
 const f=new Flight(preset('lander'),'moon-orbit',40000);try{
  f.stageNext();for(const [id,kg]of f.fuel)f.fuel.set(id,kg*.65);f.stats=statistics(f.parts,f.fuel);f.buildColliders();
  const p=lunarReturnPlan(f);assert.ok(p.ready);const start=p.startTime;
  f.maneuver=lunarReturnNode(p,f);f.sasMode='maneuver';
  const coast=advanceCoastFleet(f,start-f.universalTime-60,{maxSteps:10000});assert.equal(coast.reason,'予定噴射の直前');assert.ok(coast.remaining<.1);
  while(f.universalTime<start)f.step(Math.min(1/120,start-f.universalTime));
  while(!f.maneuver.complete&&f.universalTime<start+120){const left=new T.Vector3(...f.maneuver.remaining).length();f.throttle=left<2?.01:left<10?.1:1;f.step(1/120);}f.throttle=0;
  assert.ok(f.maneuver.complete);
  const exit=advanceCoastFleet(f,20000,{maxSteps:10000});assert.equal(exit.reason,'月重力圏の境界');
  for(let j=0;j<120&&f.orbit.bodyId==='moon';j++)f.step(1);
  assert.equal(f.orbit.bodyId,'planet');assert.ok(Math.abs(f.orbit.periapsis-p.finite.exit.orbit.periapsis)<1000);
  for(let j=0;j<120;j++)f.step(.25);
  const arrival=advanceCoastFleet(f,60000,{maxSteps:10000});assert.equal(arrival.reason,'大気・地表への接近');
  assert.ok(f.orbit.altitude>70000&&f.orbit.altitude<75000);assert.ok(f.orbit.vertical<0);assert.ok(f.orbit.periapsis>10000&&f.orbit.periapsis<70000);assert.equal(f.crashed,false);assert.ok(f.fuelRatio>.5);
 }finally{f.dispose();}
});

test('Return planning rejects missing ignition, thrust and unsafe starting orbit',()=>{
 const f=new Flight(preset('lander'),'moon-orbit',40000);try{
  assert.throws(()=>lunarReturnPlan(f),/点火/);f.stageNext();f.throttle=.1;assert.throws(()=>lunarReturnPlan(f),/停止/);f.throttle=0;
  for(const id of f.fuel.keys())f.fuel.set(id,0);f.stats=statistics(f.parts,f.fuel);const p=lunarReturnPlan(f);assert.equal(p.ready,false);assert.ok(p.warnings.some(x=>x.includes('推進剤')));
 }finally{f.dispose();}
 const surface=new Flight(preset('lander'),'moon-surface');try{surface.stageNext();assert.throws(()=>lunarReturnPlan(surface),/安全な周回/);}finally{surface.dispose();}
});
