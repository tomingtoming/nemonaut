import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {symmetryPlacementPoses} from '../dist/placement-poses.js';
import {placementSymmetryFrame} from '../dist/symmetry.js';
test('Placement transforms match saved symmetry frames for every radial count and both bays',()=>{
 const p=new T.Vector3(3,4,5),q=new T.Quaternion().setFromEuler(new T.Euler(.2,.4,.6));
 for(const bay of ['vab','sph'])for(const count of [1,2,3,4,6,8]){
  const poses=symmetryPlacementPoses(p,q,String(count),bay,'engine');assert.equal(poses.length,count);
  for(let i=0;i<count;i++){
   const frame=new T.Matrix4().fromArray(placementSymmetryFrame(String(count),bay,i,count));
   assert.ok(poses[i].pos.distanceTo(p.clone().applyMatrix4(frame))<1e-8);
   const expected=new T.Quaternion().setFromRotationMatrix(frame).multiply(q);assert.ok(poses[i].q.angleTo(expected)<1e-7);
  }
 }
 assert.deepEqual(p.toArray(),[3,4,5]);
});
test('Mirror placement preserves handedness, and rejects invalid counts without touching the source',()=>{
 const p=new T.Vector3(3,4,5),q=new T.Quaternion().setFromEuler(new T.Euler(.2,.4,.6)),original=q.clone(),r=new T.Matrix4().makeScale(-1,1,1);
 for(const type of ['engine','wing']){
  const [a,b]=symmetryPlacementPoses(p,q,'mirror','sph',type);assert.deepEqual(b.pos.toArray(),[-3,4,5]);
  const expected=new T.Matrix4().makeRotationFromQuaternion(q).premultiply(r).multiply(r);
  if(type==='wing')expected.multiply(new T.Matrix4().makeRotationY(Math.PI));
  assert.ok(b.q.angleTo(new T.Quaternion().setFromRotationMatrix(expected))<1e-7);
  a.pos.x=99;assert.equal(p.x,3);assert.ok(q.equals(original));
 }
 assert.throws(()=>symmetryPlacementPoses(p,q,'7','vab','engine'));
});
