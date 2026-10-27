import test from 'node:test';import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';import {preset} from '../dist/catalog.js';
import {AircraftHoldPrototype} from '../tools/aircraft-hold-prototype.mjs';

test('experimental guidance commands actuators without changing physical state; pause and manual release are explicit',()=>{
 const f=new Flight(preset('plane'),'runway');
 try{
  f.sas=false;f.trim=.12;f.sasMode='prograde';f.throttle=.5;
  const p=new AircraftHoldPrototype(f),pos=f.pos.clone(),vel=f.vel.clone(),q=f.q.clone(),omega=f.omega.clone();
  p.update(f,0);assert.equal(f.sas,false);assert.equal(f.trim,.12);assert.equal(f.throttle,.5);
  p.update(f,1/120);assert.equal(f.sas,true);assert.equal(f.sasMode,'hold');
  assert.deepEqual(f.pos,pos);assert.deepEqual(f.vel,vel);assert.deepEqual(f.q,q);assert.deepEqual(f.omega,omega);
  f.throttle=.23;p.update(f,1/120,{manual:true});assert.equal(p.running,false);
  assert.equal(f.throttle,.23);assert.equal(f.sas,false);assert.equal(f.trim,.12);assert.equal(f.sasMode,'prograde');
  assert.ok(f.holdQ.angleTo(q)<1e-7);
  p.update(f,1);assert.equal(f.throttle,.23);
 }finally{f.dispose();}
});
test('experimental owner does not write to another vessel and rejects nonfinite guidance',()=>{
 const a=new Flight(preset('plane'),'runway'),b=new Flight(preset('plane-large'),'runway');
 try{
  const p=new AircraftHoldPrototype(a);b.throttle=.37;b.trim=.1;
  p.update(b,1/120);assert.equal(p.running,false);assert.equal(b.throttle,.37);assert.equal(b.trim,.1);
  const invalid=new AircraftHoldPrototype(a);invalid.target.altitude=NaN;a.throttle=.8;
  invalid.update(a,1/120);assert.equal(invalid.running,false);assert.equal(invalid.reason,'fault');assert.equal(a.throttle,0);
  assert.throws(()=>new AircraftHoldPrototype(a,{speed:NaN}));
  assert.throws(()=>new AircraftHoldPrototype({parts:[],stats:{mass:0}}));
 }finally{a.dispose();b.dispose();}
});
