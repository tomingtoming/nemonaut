import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {TakeoffPrototype} from '../tools/takeoff-prototype.mjs';

test('experimental attitude loop retains guidance between samples without changing physical state',()=>{
 const f=new Flight(preset('plane'),'runway',161700);
 try{
  const p=new TakeoffPrototype(f,{speed:120,integral:true,handoff:'attitude'});
  p.cruise={telemetry:{pitch:0}};
  const pos=f.pos.clone(),velocity=f.vel.clone(),pose=f.q.clone();
  f.holdQ=f.q.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),.1));
  const first=p.cruiseCommands(f,1/120);assert.ok(first.yaw>.1);
  f.holdQ=f.q.clone(); // Flight's SAS-off bookkeeping must not erase guidance.
  const second=p.cruiseCommands(f,1/120);assert.ok(second.yaw>.1);
  assert.deepEqual(f.pos,pos);assert.deepEqual(f.vel,velocity);assert.deepEqual(f.q,pose);
  p.cruise.telemetry={pitch:0};
  f.holdQ=f.q.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),-.1));
  assert.ok(p.cruiseCommands(f,1/120).yaw<-.1);
  p.cruise.running=false;
  assert.deepEqual(p.cruiseCommands(f,1/120),{});assert.equal(p.phase,'stopped');
 }finally{f.dispose();}
});
