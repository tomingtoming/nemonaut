import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Flight,descendants} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {fleet} from '../dist/fleet.js';
import {saveFlight,loadFlight} from '../dist/flight-save.js';
test('Individual separation preserves stage, ignition and resources with rotating mass conservation',()=>{
 const f=new Flight(preset('launcher'),'orbit');let restored;
 try{
  f.stageNext();f.throttle=.42;f.omega.set(.02,.03,.04);
  const ring=f.parts.find(p=>p.type==='decoupler'),expected=descendants(f.parts,ring.id),active=[...f.active].sort(),fuel=[...f.fuel].sort(),charge=[...f.charge].sort();
  const momentum=f.vel.clone().multiplyScalar(f.stats.mass),mass=f.stats.mass,center=f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));
  assert.deepEqual(f.decouplePart(ring.id),expected);assert.equal(f.stage,0);assert.equal(f.started,true);assert.equal(f.brake,false);assert.equal(f.throttle,.42);
  const all=fleet(f);assert.equal(all.length,2);assert.deepEqual(all.flatMap(v=>[...v.active]).sort(),active);assert.deepEqual(all.flatMap(v=>[...v.fuel]).sort(),fuel);assert.deepEqual(all.flatMap(v=>[...v.charge]).sort(),charge);
  assert.ok(all.reduce((sum,v)=>sum.addScaledVector(v.vel,v.stats.mass),new T.Vector3()).distanceTo(momentum)<1e-7);
  assert.ok(all.reduce((sum,v)=>sum.addScaledVector(v.pos.clone().add(v.stats.com.clone().applyQuaternion(v.q)),v.stats.mass/mass),new T.Vector3()).distanceTo(center)<1e-8);
  assert.equal(f.decouplePart(ring.id).size,0);assert.equal(f.detached[0].canDecouplePart(ring.id),false);
  restored=loadFlight(saveFlight(f));assert.equal(restored.stage,0);assert.equal(restored.detached.length,1);assert.deepEqual([...restored.detached[0].active].sort(),active);
  f.stageNext();assert.equal(f.stage,1);assert.equal(f.detached.length,1);assert.equal(f.active.size,1);
 }finally{f.dispose();restored?.dispose();}
});
test('Individual separation does not start flight or arm chutes and rejects unavailable hardware',()=>{
 const f=new Flight(preset('returner'),'orbit');try{
  const ring=f.parts.find(p=>p.type==='decoupler');assert.ok(ring);
  assert.equal(f.decouplePart('missing').size,0);assert.equal(f.decouplePart(f.parts[0].id).size,0);
  f.crashed=true;assert.equal(f.canDecouplePart(ring.id),false);assert.equal(f.decouplePart(ring.id).size,0);f.crashed=false;
  f.thermal.get(ring.id).failed=true;assert.equal(f.decouplePart(ring.id).size,0);f.thermal.get(ring.id).failed=false;
  assert.ok(f.decouplePart(ring.id).size);assert.equal(f.stage,-1);assert.equal(f.started,false);assert.equal(f.brake,true);assert.equal(f.active.size,0);assert.ok(fleet(f).every(v=>[...v.chutes.values()].every(c=>c.status==='stowed')));
 }finally{f.dispose();}
});
