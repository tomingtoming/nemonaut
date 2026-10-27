import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {PARTS,part} from '../dist/catalog.js';
import {Flight,statistics} from '../dist/core.js';
import {saveFlight,loadFlight} from '../dist/flight-save.js';
import {partCenter,partRotation} from '../dist/aero.js';
import RAPIER from '../dist/vendor/rapier/rapier.mjs';
import {createPartColliders} from '../dist/part-colliders.js';

test('hollow part preserves cavity, rotated wall positions, mass and COM across rebuild and save',()=>{
 const original=PARTS.tank;
 // Four non-overlapping walls around a passage along the local Y axis.
 PARTS.tank={...original,size:[4,6,4],collisionBoxes:[
  {center:[-1.75,0,0],size:[.5,6,4]}, {center:[1.75,0,0],size:[.5,6,4]},
  {center:[0,0,-1.75],size:[3,6,.5]}, {center:[0,0,1.75],size:[3,6,.5]}
 ]};
 let f;
 try{
  const p=part('tank',[3,2,-4],[.3,.7,-.4],null,0);
  f=new Flight([p],'orbit');
  const check=()=>{
   assert.equal(f.body.numColliders(),4);
   const expected=statistics(f.parts,f.fuel,f.ballast,f.thermal);
   assert.ok(Math.abs(f.body.mass()-expected.mass)<.01);
   assert.ok(new T.Vector3().copy(f.body.localCom()).distanceTo(expected.com)<1e-5);
   const group=f.colliderGroups.get(p.id);
   const bodyPosition=new T.Vector3().copy(f.body.translation());
   const bodyRotation=new T.Quaternion().copy(f.body.rotation());
   const center=partCenter(p).applyQuaternion(bodyRotation).add(bodyPosition);
   assert.ok(group.every(({collider})=>!collider.containsPoint(center)),'cavity must not be solid');
   group.forEach(({collider},i)=>{
    const local=new T.Vector3(...PARTS.tank.collisionBoxes[i].center).applyQuaternion(partRotation(p)).add(partCenter(p));
    assert.ok(new T.Vector3().copy(collider.translationWrtParent()).distanceTo(local)<1e-5);
    assert.ok(collider.containsPoint(local.applyQuaternion(bodyRotation).add(bodyPosition)),'wall material must collide');
   });
  };
  check();f.fuel.set(p.id,123);f.updateColliderMasses();check();
  f.buildColliders();check();assert.equal(f.world.colliders.len(),5,'no orphaned walls after rebuild');
  const loaded=loadFlight(saveFlight(f));f.dispose();f=loaded;check();
  const world=new RAPIER.World({x:0,y:-9.81,z:0});
  try{
   const frame=world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
   createPartColliders(world,frame,part('tank',[0,0,0],[0,0,0],null,0),100);
   const drop=x=>{const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x,4,0).setCcdEnabled(true));world.createCollider(RAPIER.ColliderDesc.ball(.2).setMass(1),body);return body;};
   const inside=drop(0),wall=drop(1.75);
   for(let i=0;i<120;i++)world.step();
   assert.ok(inside.translation().y<-5,'payload passes through the hollow opening');
   assert.ok(Math.abs(wall.translation().y-3.2)<.03,'wall supports a colliding payload');
  }finally{world.free();}
 }finally{f?.dispose();PARTS.tank=original;}
});

test('compound definition rejects a mass center that disagrees with flight statistics',()=>{
 const original=PARTS.tank;
 PARTS.tank={...original,collisionBoxes:[{center:[1,0,0],size:[1,1,1]}]};
 // Validate through the helper on an owned world so failure is disposed as well.
 return import('../dist/part-colliders.js').then(async({createPartColliders})=>{
  const {default:R}=await import('../dist/vendor/rapier/rapier.mjs');
  const world=new R.World({x:0,y:0,z:0});
  try{const body=world.createRigidBody(R.RigidBodyDesc.dynamic());assert.throws(()=>createPartColliders(world,body,part('tank'),100),/mass center/);assert.equal(body.numColliders(),0);}
  finally{world.free();PARTS.tank=original;}
 });
});
