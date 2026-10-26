import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {Flight} from '../dist/core.js';import {preset} from '../dist/catalog.js';import {PRIMARY,bodyState} from '../dist/celestial.js';
import {launchSiteOrientation,surfaceOrientation,surfaceRelativeVelocity} from '../dist/surface-frame.js';
import {launchWorld} from '../dist/world-operations.js';import {worldFromFlight} from '../dist/world-save.js';import {saveFlight,loadFlight} from '../dist/flight-save.js';
test('Pad and runway stay distinct and co-rotate with aligned local up and zero airspeed',()=>{for(const time of [0,5387,192686]){const a=new Flight(preset('rocket'),'land',time),b=new Flight(preset('plane'),'runway',time);try{assert.ok(a.pos.distanceTo(b.pos)>1990&&a.pos.distanceTo(b.pos)<2010);const expected=surfaceOrientation(time).multiply(launchSiteOrientation('runway'));assert.ok(b.q.angleTo(expected)<1e-7);const up=new T.Vector3(0,1,0).applyQuaternion(b.q),radial=b.pos.clone().sub(bodyState(PRIMARY,time).position).normalize();assert.ok(up.distanceTo(radial)<1e-8);const com=b.pos.clone().add(b.stats.com.clone().applyQuaternion(b.q));assert.ok(surfaceRelativeVelocity(com,b.vel,time).length()<1e-8);for(let i=0;i<240;i++)b.step(1/120);assert.equal(b.crashed,false);assert.ok(b.pos.distanceTo(a.pos)<2100);}finally{a.dispose();b.dispose();}}});
test('Occupied pad permits runway launch but a second runway departure is blocked',()=>{const w=launchWorld(worldFromFlight(null,{universalTime:192686}),{parts:preset('rocket'),name:'Pad',environment:'land'}),w2=launchWorld(w,{parts:preset('plane'),name:'Runway',environment:'runway'});assert.equal(w2.vessels.length,2);assert.throws(()=>launchWorld(w2,{parts:preset('plane'),name:'Second',environment:'runway'}),e=>e.code==='launch_site_occupied');});
test('Saved aircraft retain their old coordinates instead of teleporting to the new runway',()=>{const f=new Flight(preset('plane'),'land',1234);f.environment='runway';let restored;try{const saved=saveFlight(f);restored=loadFlight(saved);assert.deepEqual(restored.pos.toArray(),saved.pos);assert.deepEqual(restored.q.toArray(),saved.q);assert.deepEqual(restored.vel.toArray(),saved.vel);}finally{f.dispose();restored?.dispose();}});

test('Sea departure is independent of occupied land sites and follows planetary rotation',()=>{
 for(const time of [0,5387,192719]){
  const w=launchWorld(worldFromFlight(null,{universalTime:time}),{parts:preset('rocket'),name:'Pad',environment:'land'});
  const w2=launchWorld(w,{parts:preset('plane'),name:'Runway',environment:'runway'});
  const w3=launchWorld(w2,{parts:preset('boat'),name:'Sea',environment:'water'});
  assert.equal(w3.vessels.length,3);for(const prior of w2.vessels)assert.deepEqual(w3.vessels.find(v=>v.vesselId===prior.vesselId),prior);
  assert.throws(()=>launchWorld(w3,{parts:preset('boat'),name:'Second boat',environment:'water'}),e=>e.code==='launch_site_occupied');
  const f=new Flight(preset('boat'),'water',time),pad=new Flight(preset('rocket'),'land',time);let restored;
  try{
   assert.ok(f.pos.distanceTo(pad.pos)>3990&&f.pos.distanceTo(pad.pos)<4010);
   assert.ok(f.q.angleTo(surfaceOrientation(time).multiply(launchSiteOrientation('water')))<1e-7);
   const com=f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));assert.ok(surfaceRelativeVelocity(com,f.vel,time).length()<1e-8);
   for(let i=0;i<240;i++)f.step(1/120);assert.equal(f.crashed,false);
   const saved=saveFlight(f);restored=loadFlight(saved);assert.deepEqual(restored.pos.toArray(),saved.pos);
  }finally{f.dispose();pad.dispose();restored?.dispose();}
 }
});
test('Legacy sea vessels retain their saved location on load',()=>{
 const f=new Flight(preset('boat'),'land',1234);let restored;
 try{f.environment='water';const saved=saveFlight(f);restored=loadFlight(saved);assert.deepEqual(restored.pos.toArray(),saved.pos);assert.deepEqual(restored.q.toArray(),saved.q);assert.deepEqual(restored.vel.toArray(),saved.vel);}finally{f.dispose();restored?.dispose();}
});
