import {surfaceRelativeVelocity} from '../dist/surface-frame.js';
const surfaceSpeed=f=>surfaceRelativeVelocity(f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),f.vel,f.universalTime).length();
import {saveFlight,loadFlight} from '../dist/flight-save.js';
import {lunarReturnPlan,lunarReturnNode} from '../dist/lunar-return.js';
import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {Flight} from '../dist/core.js';import {preset} from '../dist/catalog.js';import {LaunchPilot} from '../dist/launch-pilot.js';
import {lunarDeparturePlan,lunarDepartureNode} from '../dist/lunar-departure.js';import {advanceCoastFleet} from '../dist/coast-flight.js';import {lunarCapturePlan,captureNode} from '../dist/lunar-capture.js';

test('Surface launch, lunar orbit, return burn and capsule touchdown form one continuous mission',()=>{
 const f=new Flight(preset('lunar-expedition'),'land'),pilot=new LaunchPilot();
 try{
  for(let i=0;i<72000&&!pilot.done&&!f.crashed;i++){pilot.update(f);f.step(1/120);}assert.ok(pilot.done);assert.ok(f.detached.every(v=>v.throttle===0));
  const before={pos:f.pos.clone(),vel:f.vel.clone(),fuel:[...f.fuel],ut:f.universalTime},p=lunarDeparturePlan(f);
  assert.ok(p.ready,p.warnings.join(' / '));assert.ok(f.pos.equals(before.pos)&&f.vel.equals(before.vel));assert.deepEqual([...f.fuel],before.fuel);assert.equal(f.universalTime,before.ut);
  assert.ok(p.deltaV<400);assert.ok(p.startTime-f.universalTime>60);
  f.maneuver=lunarDepartureNode(p,f);const saved=saveFlight(f),restored=loadFlight(saved);try{assert.deepEqual(restored.maneuver,f.maneuver);}finally{restored.dispose();}
  for(const key of ['midTime','duration','deltaV','periapsis']){const bad=structuredClone(saved);bad.maneuver.departure[key]=-1;assert.throws(()=>loadFlight(bad));}f.sasMode='maneuver';
  while(f.universalTime<p.startTime-60){const result=advanceCoastFleet(f,p.startTime-60-f.universalTime,{maxSteps:10000});if(result.remaining<.01)break;for(let i=0;i<1200&&f.universalTime<p.startTime-60;i++)f.step(1/120);}
  assert.throws(()=>lunarDepartureNode(p,f),/再計算/);assert.ok(Math.abs(f.universalTime-(p.startTime-60))<.1);
  while(f.universalTime<p.startTime)f.step(Math.min(1/120,p.startTime-f.universalTime));
  for(let i=0;i<14400&&!f.maneuver.complete;i++){const left=new T.Vector3(...f.maneuver.remaining).length();f.throttle=left<2?.01:left<10?.1:1;f.step(1/120);}f.throttle=0;
  assert.ok(f.maneuver.complete);assert.equal(advanceCoastFleet(f,50000,{maxSteps:10000}).reason,'月重力圏の境界');
  for(let i=0;i<120&&f.orbit.bodyId!=='moon';i++)f.step(1);
  assert.equal(f.orbit.bodyId,'moon');assert.ok(Math.abs(f.orbit.periapsis-p.finite.closest.altitude)<1000);assert.equal(f.crashed,false);
  const capture=lunarCapturePlan(f);assert.ok(capture.ready,capture.warnings.join(' / '));assert.ok(capture.burn.fuelRemaining>600);
  f.maneuver=captureNode(capture,f);f.sasMode='maneuver';for(let i=0;i<120;i++)f.step(.25);
  assert.equal(advanceCoastFleet(f,capture.startTime-f.universalTime-60,{maxSteps:10000}).remaining,0);
  const burn=start=>{while(f.universalTime<start)f.step(Math.min(1/120,start-f.universalTime));for(let i=0;i<14400&&!f.maneuver.complete;i++){const left=new T.Vector3(...f.maneuver.remaining).length();f.throttle=left<2?.01:left<10?.1:1;f.step(1/120);}f.throttle=0;assert.ok(f.maneuver.complete);};
  burn(capture.startTime);assert.ok(f.orbit.energy<0);assert.ok(f.orbit.periapsis>150000&&f.orbit.apoapsis<200000);
  const ret=lunarReturnPlan(f,{targetPeriapsis:15000});assert.ok(ret.ready,ret.warnings.join(' / '));f.maneuver=lunarReturnNode(ret,f);f.sasMode='maneuver';
  assert.equal(advanceCoastFleet(f,ret.startTime-f.universalTime-60,{maxSteps:10000}).remaining,0);burn(ret.startTime);assert.ok(f.fuelRatio>.25);
  assert.equal(advanceCoastFleet(f,50000,{maxSteps:10000}).reason,'月重力圏の境界');
  for(let i=0;i<120&&f.orbit.bodyId==='moon';i++)f.step(1);for(let i=0;i<120;i++)f.step(.25);
  assert.equal(advanceCoastFleet(f,60000,{maxSteps:10000}).reason,'大気・地表への接近');assert.ok(Math.abs(f.orbit.periapsis-ret.finite.exit.orbit.periapsis)<1000);
  f.stageNext();f.sasMode='retrograde';f.stageNext();assert.equal(f.parts.length,3);
  for(let i=0;i<900*120&&!f.crashed&&!f.landed;i++)f.step(1/120);
  assert.ok(f.landed);assert.equal(f.crashed,false);assert.ok([...f.thermal.values()].every(s=>!s.failed));assert.ok(surfaceSpeed(f)<1);assert.equal(f.detached.length,3);
 }finally{f.dispose();}
});
