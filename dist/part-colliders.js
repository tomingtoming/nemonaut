import {cargoCollisionBoxes} from './cargo-geometry.js';
import * as T from 'three';
import RAPIER from './vendor/rapier/rapier.mjs';
import {PARTS} from './catalog.js';
import {partCenter,partRotation} from './aero.js';

// Box centers are relative to the part's mass center, in local part axes.
// Volume-weighted geometry must preserve that center: statistics and free-flight
// integration use the same center as Rapier.
export function createPartColliders(world,body,part,mass){
 const d=PARTS[part.type],rotation=partRotation(part),center=partCenter(part);
 const boxes=d.cargoBay?cargoCollisionBoxes(d,part.cargoOpen):d.collisionBoxes;
 let pieces;
 if(boxes){
  if(!Array.isArray(boxes)||!boxes.length)throw Error('Empty compound collider');
  let volume=0;const centroid=new T.Vector3();
  for(const box of boxes){
   if(!Array.isArray(box.center)||box.center.length!==3||!box.center.every(Number.isFinite)||!Array.isArray(box.size)||box.size.length!==3||!box.size.every(n=>Number.isFinite(n)&&n>0))throw Error('Invalid collision box');
   const v=box.size.reduce((a,b)=>a*b,1);volume+=v;centroid.addScaledVector(new T.Vector3(...box.center),v);
  }
  if(centroid.divideScalar(volume).length()>1e-7)throw Error('Compound collider must preserve part mass center');
  pieces=boxes.map(box=>({shape:RAPIER.ColliderDesc.cuboid(...box.size.map(n=>n/2)),offset:new T.Vector3(...box.center),localRotation:new T.Quaternion().setFromEuler(new T.Euler(...(box.rotation||[0,0,0]))),weight:box.size.reduce((a,b)=>a*b,1)/volume}));
 }else pieces=[{shape:d.wheel?RAPIER.ColliderDesc.ball(d.size[1]/2):RAPIER.ColliderDesc.cuboid(...d.size.map(n=>Math.max(.02,n/2))),offset:new T.Vector3(),weight:1}];
 return pieces.map(({shape,offset,weight,localRotation})=>({weight,collider:world.createCollider(shape.setTranslation(...offset.applyQuaternion(rotation).add(center).toArray()).setRotation(rotation.clone().multiply(localRotation||new T.Quaternion())).setMass(mass*weight).setFriction(d.wheel?.015:.35).setRestitution(0),body)}));
}
