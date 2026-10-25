import test from 'node:test';import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';import {preset} from '../dist/catalog.js';
import {saveFlight,loadFlight} from '../dist/flight-save.js';
import {workspaceRecord,validateWorkspace} from '../dist/workspace-save.js';
import {PHYSICS_MODEL,needsPhysicsMigration,physicsMigrationMessage} from '../dist/physics-migration.js';
import {surfaceVelocity,surfaceRelativeVelocity,surfaceAngularVelocity,inertialToFixed} from '../dist/surface-frame.js';
const center=f=>f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));
const legacy=r=>{delete r.physicsModel;delete r.physicsMigration;for(const child of r.detached)legacy(child);return r;};

test('legacy surface migration preserves location and relative rest, with no second application',()=>{
 const f=new Flight(preset('rover'),'land',4000);for(let i=0;i<120;i++)f.step(1/120);
 f.vel.sub(surfaceVelocity(center(f),f.universalTime));f.omega.sub(surfaceAngularVelocity());
 const record=legacy(saveFlight(f)),before=structuredClone(record),restored=loadFlight(record);try{
  assert.deepEqual(restored.pos.toArray(),record.pos);assert.deepEqual([...restored.fuel],record.fuel);
  assert.deepEqual(restored.physicsMigration,{surface:1,inertial:0});assert.ok(surfaceRelativeVelocity(center(restored),restored.vel,restored.universalTime).length()<.03);
  const next=saveFlight(restored);assert.equal(next.physicsModel,PHYSICS_MODEL);assert.equal(needsPhysicsMigration(next),false);
  const again=loadFlight(next);try{assert.deepEqual(again.vel.toArray(),restored.vel.toArray());assert.deepEqual(again.omega.toArray(),restored.omega.toArray());}finally{again.dispose();}
  const fixed=inertialToFixed(restored.pos,restored.universalTime);for(let i=0;i<1200;i++)restored.step(1/120);
  assert.ok(inertialToFixed(restored.pos,restored.universalTime).distanceTo(fixed)<.1);assert.equal(restored.crashed,false);
  assert.deepEqual(record,before);
 }finally{restored.dispose();f.dispose();}
});

test('legacy orbital, atmospheric and moon trajectories retain inertial state',()=>{
 for(const environment of ['orbit','entry','drop','moon-orbit','moon-surface']){
  const f=new Flight(preset('recovery'),environment,5000),record=legacy(saveFlight(f)),restored=loadFlight(record);try{
   assert.deepEqual(restored.pos.toArray(),record.pos);assert.deepEqual(restored.vel.toArray(),record.vel);assert.deepEqual(restored.omega.toArray(),record.omega);
   assert.deepEqual(restored.physicsMigration,{surface:0,inertial:1});
  }finally{restored.dispose();f.dispose();}
 }
});

test('workspace normalizes a mixed legacy fleet on copies and retains a visible migration receipt',()=>{
 const root=new Flight(preset('orbiter'),'orbit',7000),ground=new Flight(preset('rover'),'land',7000);
 ground.vel.sub(surfaceVelocity(center(ground),7000));ground.omega.sub(surfaceAngularVelocity());root.detached.push(ground);
 const record=workspaceRecord({parts:preset('plane'),name:'draft',bay:'sph',environment:'runway',flight:legacy(saveFlight(root))}),before=structuredClone(record);
 try{const next=validateWorkspace(record);assert.equal(needsPhysicsMigration(next.flight),false);assert.deepEqual(next.flight.physicsMigration,{surface:1,inertial:1});assert.ok(physicsMigrationMessage(next.flight.physicsMigration).includes('地表相対速度'));assert.deepEqual(next.parts,record.parts);assert.deepEqual(record,before);
  const bad=structuredClone(next.flight);bad.physicsModel='unknown';assert.throws(()=>loadFlight(bad));
  bad.physicsModel=PHYSICS_MODEL;bad.physicsMigration.surface=Infinity;assert.throws(()=>loadFlight(bad));
 }finally{root.dispose();}
});
