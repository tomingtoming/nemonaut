import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {selectVessel,fleet} from '../dist/fleet.js';
import {saveFlight,loadFlight} from '../dist/flight-save.js';
import {WorldRuntime} from '../dist/world-runtime.js';
import {dockVessels,undockVessel} from '../dist/docking.js';

test('One world clock survives normal/coast updates, active switching and save restore',()=>{
 let root=new Flight(preset('orbiter'),'orbit'),copy;
 const other=new Flight(preset('orbiter'),'orbit');other.pos.x+=10000;root.detached.push(other);
 try{
  const world=new WorldRuntime(root);world.step(.1);assert.equal(world.universalTime,.1);
  const coast=world.coast(10);assert.equal(coast.reason,null);assert.equal(world.universalTime,10.1);
  root=selectVessel(root,other);world.replace(root);world.step(.1);
  assert.equal(world.active,other);assert.equal(world.vessels.size,2);
  assert.ok(fleet(root).every(v=>v.universalTime===world.universalTime));
  copy=loadFlight(saveFlight(root));const restored=new WorldRuntime(copy);
  assert.equal(restored.universalTime,world.universalTime);assert.equal(restored.activeVesselId,world.activeVesselId);
  world.coast(5);restored.coast(5);
  for(const [id,v] of world.vessels)assert.ok(v.pos.distanceTo(restored.vessels.get(id).pos)<1e-8);
 }finally{root.dispose();copy?.dispose();}
});

test('Docking and undocking replace registrations without resetting the world epoch',()=>{
 let root=new Flight(preset('docking'),'orbit');
 try{
  const world=new WorldRuntime(root);world.step(.1);
  const port=root.parts.find(p=>p.dockPartner),partner=port.dockPartner;
  root=undockVessel(root,port.id);world.replace(root);assert.equal(world.vessels.size,2);
  root=dockVessels(root,root.detached[0],port.id,partner);world.replace(root);
  assert.equal(world.vessels.size,1);assert.equal(world.universalTime,.1);
  world.step(.1);assert.equal(root.universalTime,.2);
 }finally{root.dispose();}
});

test('Registration discovers staged vessels, rejects clock drift and blocked coast advances no time',()=>{
 const root=new Flight(preset('twin'),'orbit');
 try{
  const world=new WorldRuntime(root);root.stageNext();root.stageNext();world.replace(root);
  assert.equal(world.vessels.size,2);world.step(.1);
  root.throttle=1;const result=world.coast(10);
  assert.equal(result.advanced,0);assert.equal(world.universalTime,.1);
  const old=world.vessels;root.detached[0].universalTime=2;
  assert.throws(()=>world.replace(root));assert.equal(world.vessels,old);assert.equal(world.universalTime,.1);
 }finally{root.dispose();}
});
