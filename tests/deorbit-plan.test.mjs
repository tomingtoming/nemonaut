import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {PRIMARY,bodyOrbitState} from '../dist/celestial.js';import {center} from '../dist/planet.js';
import {deorbitPlan} from '../dist/deorbit-plan.js';import {Flight} from '../dist/core.js';import {preset} from '../dist/catalog.js';
for(const scale of [1,1.03])test(`return preview reaches 25 km from inclined orbit speed scale ${scale}`,()=>{
 const r=680000,q=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),.7),pos=new T.Vector3(0,r,0).applyQuaternion(q).add(center),vel=new T.Vector3(0,0,Math.sqrt(PRIMARY.mu/r)*scale).applyQuaternion(q),before=[pos.toArray(),vel.toArray()];
 const plan=deorbitPlan(pos,vel,1234);assert.equal(plan.location.universalTime,1294);assert.ok(plan.components.prograde<0);assert.ok(Math.abs(plan.preview.orbit.periapsis-25000)<.1);assert.deepEqual([pos.toArray(),vel.toArray()],before);assert.ok(plan.preview.orbit.apoapsis>70000);
});
test('return preview rejects surface, lunar, escape and invalid targets',()=>{
 for(const environment of ['land','moon-orbit']){const f=new Flight(preset('returner'),environment);try{assert.throws(()=>deorbitPlan(f.pos,f.vel,0));}finally{f.dispose();}}
 const p=center.clone().add(new T.Vector3(0,680000,0)),v=new T.Vector3(0,0,Math.sqrt(PRIMARY.mu/680000));assert.throws(()=>deorbitPlan(p,v.clone().multiplyScalar(2),0));assert.throws(()=>deorbitPlan(p,v,0,{periapsis:70000}));assert.throws(()=>deorbitPlan(p,v,0,{delay:0}));
});

import {createManeuverNode} from '../dist/maneuver-node.js';
import {surfaceRelativeVelocity} from '../dist/surface-frame.js';
test('planned return burns finite thrust, separates and lands with parachute intact',()=>{
 const f=new Flight(preset('returner'),'orbit');
 try{
  f.stageNext();f.stageNext();const pos=f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),plan=deorbitPlan(pos,f.vel,f.universalTime);
  f.maneuver=createManeuverNode(plan.preview,f.time);f.maneuver.stopAtTarget=true;f.maneuver.tolerance=.05;f.sas=true;f.sasMode='maneuver';
  while(f.universalTime<plan.location.universalTime)f.step(1/120);
  for(let i=0;i<120*180&&!f.maneuver.complete&&!f.crashed;i++){f.throttle=.1;f.step(1/120);}
  assert.equal(f.maneuver.complete,true);assert.equal(f.throttle,0);assert.ok(f.orbit.periapsis>15000&&f.orbit.periapsis<35000,`actual periapsis ${f.orbit.periapsis}`);
  f.stageNext();f.armParachutes();let opened=false;
  for(let i=0;i<60*3000&&!f.landed&&!f.crashed;i++){f.sasMode=f.vel.length()>300?'retrograde':'radial';f.step(1/60);opened||=[...f.chutes.values()].some(c=>c.status==='open');}
  assert.ok(opened);assert.equal(f.crashed,false);assert.equal(f.landed,true);assert.equal(f.parts.length,3);assert.ok(surfaceRelativeVelocity(f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),f.vel,f.universalTime).length()<.8);
 }finally{f.dispose();}
});
