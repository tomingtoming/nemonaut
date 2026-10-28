import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {Flight} from '../dist/core.js';import {preset} from '../dist/catalog.js';
import {MOON,bodyState} from '../dist/celestial.js';
import {descentTelemetry,descentGuidance} from '../dist/descent.js';
import {advanceCoastFleet,coastSurfaceMargin} from '../dist/coast-flight.js';

test('Descent warnings distinguish orbital, outbound, inbound and landed motion from real geometry',()=>{
 const f=new Flight(preset('lunar-return'),'moon-orbit',40000);try{
  f.stageNext();let d=descentTelemetry(f);assert.match(descentGuidance(d),/月周回中/);
  const moon=bodyState(MOON,f.universalTime);
  f.pos.copy(moon.position).add(new T.Vector3(0,MOON.radius+22000,0));
  f.vel.copy(moon.velocity).add(new T.Vector3(0,84,805));
  d=descentTelemetry(f);assert.ok(d.energy>0);assert.match(descentGuidance(d),/離脱中/);assert.doesNotMatch(descentGuidance(d),/直ちに減速/);
  f.vel.copy(moon.velocity).add(new T.Vector3(0,-400,100));
  d=descentTelemetry(f);assert.ok(d.periapsis<1000);assert.match(descentGuidance(d),/降下進入中|直ちに減速/);
  f.vel.copy(moon.velocity).add(new T.Vector3(0,20,0));
  assert.match(descentGuidance(descentTelemetry(f)),/上昇中/);
  f.landed=true;assert.match(descentGuidance(descentTelemetry(f),.2),/噴射を停止/);
  f.crashed=true;assert.equal(descentGuidance(descentTelemetry(f)),'機体損傷');
 }finally{f.dispose();}
});

test('Four-legged lander settles on the moving lunar surface with the engine clear',()=>{
 for(const epoch of [0,40000])for(const direction of [new T.Vector3(0,1,0),new T.Vector3(1,0,0),new T.Vector3(1,-1,1).normalize()]){const f=new Flight(preset('lander'),'moon-orbit',epoch);try{
  const moon=bodyState(MOON,epoch);f.q.setFromUnitVectors(new T.Vector3(0,1,0),direction);f.pos.copy(moon.position).addScaledVector(direction,MOON.radius+2.2);f.vel.copy(moon.velocity);f.sasMode='radial';
  for(let i=0;i<1200;i++)f.step(1/120);
  assert.equal(f.crashed,false);assert.equal(f.landed,true);assert.ok(f.orbit.relativeVelocity.length()<.1);
  const engine=f.parts.find(p=>p.type==='engine'),bottom=new T.Vector3(...engine.p).add(new T.Vector3(0,-.6,0)).applyQuaternion(f.q).add(f.pos);
  assert.ok(bottom.distanceTo(bodyState(MOON,f.universalTime).position)-MOON.radius>.5);
  assert.equal(f.parts.filter(p=>p.type==='landingLeg').length,4);
 }finally{f.dispose();}}
});

test('Descent instruments use lowest geometry and actual active fuel networks without consuming resources',()=>{
 const f=new Flight(preset('lander'),'moon-orbit');try{
  const before=[...f.fuel],off=descentTelemetry(f);assert.equal(off.thrust,0);assert.equal(off.brakingDistance,Infinity);
  f.stageNext();const on=descentTelemetry(f);assert.equal(on.thrust,45000);assert.ok(on.clearance<20000);assert.ok(on.horizontal>500);assert.ok(on.hoverThrottle<.15);assert.equal(on.legs,4);assert.deepEqual([...f.fuel],before);
  for(const id of f.fuel.keys())f.fuel.set(id,0);assert.equal(descentTelemetry(f).thrust,0);
 }finally{f.dispose();}
});

test('Landing legs do not hide damage from a high-speed lunar impact',()=>{
 const f=new Flight(preset('lander'),'moon-orbit',40000);try{
  const moon=bodyState(MOON,40000);f.q.identity();f.pos.copy(moon.position).add(new T.Vector3(0,MOON.radius+5,0));f.vel.copy(moon.velocity).add(new T.Vector3(0,-30,0));f.sasMode='radial';
  for(let i=0;i<120&&!f.crashed;i++)f.step(1/120);
  assert.ok(f.failureEvents.some(e=>e.cause==='impact'));assert.ok(f.parts.length<preset('lander').length);assert.ok(f.detached.length>0);
 }finally{f.dispose();}
});

test('Lunar descent warp stops with braking and attitude margin before the fixed surface cutoff',()=>{
 const f=new Flight(preset('lander'),'moon-orbit',40000);try{
  const moon=bodyState(MOON,40000);f.q.identity();f.pos.copy(moon.position).add(new T.Vector3(0,MOON.radius+12000,0));f.vel.copy(moon.velocity).add(new T.Vector3(0,-200,0));f.stageNext();
  assert.ok(coastSurfaceMargin(f)>4000);const result=advanceCoastFleet(f,1000,{maxSteps:10000});
  assert.equal(result.reason,'大気・地表への接近');assert.ok(f.orbit.altitude>4000);assert.ok(f.orbit.altitude<12000);assert.equal(f.crashed,false);
 }finally{f.dispose();}
});

test('Lunar landing coast reserves braking distance for horizontal speed as well as descent',()=>{
 const f=new Flight(preset('lander'),'moon-orbit',40000);try{
  const moon=bodyState(MOON,f.universalTime);
  f.pos.copy(moon.position).add(new T.Vector3(0,MOON.radius+12000,0));
  f.vel.copy(moon.velocity).add(new T.Vector3(0,-30,500));f.stageNext();
  const d=descentTelemetry(f);
  assert.ok(d.horizontal>490);assert.ok(d.vertical<0);
  assert.ok(coastSurfaceMargin(f)>d.brakingDistance,'low periapsis needs room to brake total surface-relative velocity');
 }finally{f.dispose();}
});

test('Real lander can brake from lunar circular orbit and descend to a stationary touchdown',()=>{
 const f=new Flight(preset('lander'),'moon-orbit',40000);try{
  f.sasMode='retrograde';for(let i=0;i<120*30;i++)f.step(1/120);f.stageNext();f.throttle=1;
  while(f.orbit.speed>2&&f.time<120)f.step(1/120);
  assert.ok(f.orbit.speed<=2,'orbital braking must complete');f.throttle=0;f.sasMode='radial';
  while(!f.landed&&!f.crashed&&f.time<1500){
   const d=descentTelemetry(f),target=-Math.min(35,Math.max(.6,d.clearance/15));
   const demand=d.gravity+(target-d.vertical)*.8;
   f.throttle=Math.max(0,Math.min(1,demand/d.acceleration));
   if(d.clearance<.2&&Math.abs(d.vertical)<1)f.throttle=0;
   f.step(1/60);
  }
  assert.equal(f.crashed,false);assert.equal(f.landed,true);assert.ok(f.orbit.speed<.8);assert.ok(f.fuelRatio>.1);
 }finally{f.dispose();}
});
