import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Flight} from '../dist/core.js';
import {part,preset} from '../dist/catalog.js';
import {recordFailure,validateFailureEvents} from '../dist/failure-events.js';
import {saveFlight,loadFlight} from '../dist/flight-save.js';
import {surfaceVelocity} from '../dist/surface-frame.js';

test('fuel burst depends on the failed part inventory, not nearby fuel',()=>{
 const f=new Flight(preset('rocket'),'land');
 try{
  const tank=f.parts.find(p=>p.type==='tank'),engine=f.parts.find(p=>p.type==='engine');
  assert.ok(tank&&engine);
  assert.equal(recordFailure(f,engine,'impact').effect,'fragments');
  const fuel=f.fuel.get(tank.id);assert.equal(recordFailure(f,tank,'thermal').effect,'fuel-burst');
  assert.equal(f.fuel.get(tank.id),fuel,'event recording does not consume physical fuel');
  assert.equal(recordFailure(f,tank,'thermal'),null);
  const saved=saveFlight(f),restored=loadFlight(saved);try{assert.deepEqual(restored.failureEvents,f.failureEvents);restored.failureEvents[0].position[0]++;assert.notDeepEqual(restored.failureEvents,f.failureEvents);}finally{restored.dispose();}
  delete saved.failureEvents;const legacy=loadFlight(saved);assert.deepEqual(legacy.failureEvents,[]);legacy.dispose();
  f.failureEvents=[];f.fuel.set(tank.id,0);assert.equal(recordFailure(f,tank,'impact').effect,'fragments');
 }finally{f.dispose();}
});
test('actual hard touchdown emits one impact; gentle rest emits none',()=>{
 for(const speed of [0,25]){
  const f=new Flight([part('probe',[0,0,0])],'land');
  try{
   if(speed){f.pos.y+=3;f.vel.copy(surfaceVelocity(f.pos)).add(new T.Vector3(0,-speed,0));}
   for(let i=0;i<240&&!f.crashed;i++)f.step(1/120);
   assert.equal(f.crashed,speed>0);assert.equal(f.failureEvents.length,speed?1:0);
   if(speed){assert.equal(f.failureEvents[0].cause,'impact');assert.equal(f.failureEvents[0].partId,f.parts[0].id);assert.ok(f.failureEvents[0].speed>9);for(let i=0;i<30;i++)f.step(1/120);assert.equal(f.failureEvents.length,1);}
  }finally{f.dispose();}
 }
});
test('invalid failure history is rejected before loading physics resources',()=>{
 const f=new Flight([part('tank',[0,0,0])],'orbit');try{
  recordFailure(f,f.parts[0],'thermal');const good=structuredClone(f.failureEvents);
  for(const change of [e=>e.speed=NaN,e=>e.effect='fragments',e=>e.type='unknown',e=>e.position=[1],e=>e.time=-1]){const bad=structuredClone(good);change(bad[0]);assert.throws(()=>validateFailureEvents(bad));}
  assert.throws(()=>validateFailureEvents([good[0],good[0]]));
 }finally{f.dispose();}
});
