import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {predictTrajectory,predictTrajectoryAsync,trajectorySteps,trajectoryAt} from '../dist/trajectory.js';
import {MOON,bodyState,lunarTrial} from '../dist/celestial.js';
import {Flight} from '../dist/core.js';import {preset} from '../dist/catalog.js';

test('Predicted lunar coast agrees with real Flight and leaves inputs untouched',()=>{
 const epoch=45000,f=new Flight(preset('orbiter'),'moon-orbit',epoch);try{
  f.sas=false;const pos=f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),vel=f.vel.clone(),before=[pos.toArray(),vel.toArray()];
  const result=predictTrajectory(pos,vel,epoch,{duration:600});for(let i=0;i<72000;i++)f.step(1/120);
  const actual=f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));assert.ok(actual.distanceTo(new T.Vector3(...result.position))<1);assert.ok(f.vel.distanceTo(new T.Vector3(...result.velocity))<.01);
  assert.equal(result.complete,true);assert.deepEqual([pos.toArray(),vel.toArray()],before);
  for(const p of result.points)assert.ok(new T.Vector3(...p.moon).distanceTo(bodyState(MOON,p.time).position)<1e-8);
 }finally{f.dispose();}
});

test('Prediction reports entry and exit, while a distant orbit does not invent an encounter',()=>{
 const epoch=2000,b=bodyState(MOON,epoch),start=b.position.clone().add(new T.Vector3(-MOON.sphereOfInfluence-10000,600000,0)),velocity=b.velocity.clone().add(new T.Vector3(4000,0,0));
 const pass=predictTrajectory(start,velocity,epoch,{duration:1800});assert.equal(pass.complete,true);assert.deepEqual(pass.events.map(e=>e.type),['enter-moon','leave-moon']);assert.ok(pass.closest.distance<MOON.sphereOfInfluence);assert.equal(pass.closest.atBoundary,false);
 const far=predictTrajectory(new T.Vector3(0,80000,0),new T.Vector3(0,0,2278.9),epoch,{duration:600});assert.equal(far.events.length,0);assert.ok(far.closest.distance>MOON.sphereOfInfluence);
});

test('Finer prediction steps converge across a lunar flyby',()=>{
 const epoch=2000,b=bodyState(MOON,epoch),pos=b.position.clone().add(new T.Vector3(-MOON.sphereOfInfluence-10000,600000,0)),vel=b.velocity.clone().add(new T.Vector3(4000,0,0));
 const run=maxStep=>predictTrajectory(pos,vel,epoch,{duration:1800,maxStep,tolerance:.1}),coarse=run(10),fine=run(5),reference=run(.1),distance=r=>new T.Vector3(...r.position).distanceTo(new T.Vector3(...reference.position));assert.ok(distance(fine)<distance(coarse));
});

test('Prediction is bounded and distinguishes atmosphere, surface and budget from a completed horizon',()=>{
 const trial=lunarTrial(0);const short=predictTrajectory(trial.pos,trial.vel,0,{duration:600,maxSteps:2});assert.equal(short.complete,false);assert.equal(short.reason,'budget');
 const air=predictTrajectory(new T.Vector3(0,50000,0),new T.Vector3(0,0,2000),0,{duration:600});assert.equal(air.reason,'atmosphere');assert.equal(air.complete,false);
 const ground=predictTrajectory(new T.Vector3(0,-1,0),new T.Vector3(),0,{duration:600});assert.equal(ground.reason,'surface');
 const iterator=trajectorySteps(trial.pos,trial.vel,0,{duration:100,chunk:2});assert.equal(iterator.next().done,false);
});

test('A scheduled impulse is applied at its exact epoch without resetting position',()=>{
 const {pos,vel}=lunarTrial(100),plain=predictTrajectory(pos,vel,100,{duration:30}),planned=predictTrajectory(pos,vel,100,{duration:30,burn:{time:115,deltaV:[0,0,100]}});
 assert.equal(planned.burnApplied,true);assert.equal(planned.events[0].time,115);assert.ok(new T.Vector3(...planned.velocity).distanceTo(new T.Vector3(...plain.velocity))>99);
 assert.throws(()=>predictTrajectory(pos,vel,100,{duration:0}));assert.throws(()=>predictTrajectory(pos,vel,100,{burn:{time:99,deltaV:[0,0,1]}}));
});

test('Interactive prediction yields and cancels stale work without returning a false result',async()=>{
 const {pos,vel}=lunarTrial(0),controller=new AbortController();let yields=0;
 await assert.rejects(predictTrajectoryAsync(pos,vel,0,{duration:600,chunk:4,signal:controller.signal,yieldTask:async()=>{yields++;controller.abort();}}),{name:'AbortError'});assert.equal(yields,1);
 const options={duration:30,chunk:4},expected=predictTrajectory(pos,vel,0,options),actual=await predictTrajectoryAsync(pos,vel,0,{...options,yieldTask:async()=>{yields++;}});assert.deepEqual(actual,expected);assert.ok(yields>2);
});

test('Comparison cursor uses the same epoch on differently sampled trajectories',()=>{
 const result={startTime:10,endTime:30,points:[{time:10,position:[0,0,0]},{time:20,position:[10,20,30]},{time:30,position:[20,40,60]}]};
 const p=trajectoryAt(result,15);assert.equal(p.time,15);assert.deepEqual(p.position,[5,10,15]);assert.deepEqual(p.moon,bodyState(MOON,15).position.toArray());assert.equal(p.clamped,false);
 const end=trajectoryAt(result,40);assert.equal(end.time,30);assert.equal(end.clamped,true);assert.deepEqual(end.position,[20,40,60]);
});
