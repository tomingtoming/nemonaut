import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {equivalentThrustLine,mountThrustOverlay} from '../dist/thrust-overlay.js';

test('equivalent line reproduces transverse torque and preserves axial couple',()=>{
 const balance={com:[2,3,4],force:[10,20,-30],torque:[70,-50,90]},before=structuredClone(balance);
 const result=equivalentThrustLine(balance),f=new T.Vector3(...balance.force),d=f.clone().normalize();
 const reconstructed=new T.Vector3(...result.offset).cross(f).addScaledVector(d,result.axialTorque);
 assert.ok(reconstructed.distanceTo(new T.Vector3(...balance.torque))<1e-10);
 assert.ok(Math.abs(new T.Vector3(...result.offset).dot(d))<1e-10);
 const q=new T.Quaternion().setFromEuler(new T.Euler(.5,1,-.3)),shift=new T.Vector3(100,-40,200);
 const transformed={com:new T.Vector3(...balance.com).applyQuaternion(q).add(shift).toArray(),force:f.clone().applyQuaternion(q).toArray(),torque:new T.Vector3(...balance.torque).applyQuaternion(q).toArray()};
 const other=equivalentThrustLine(transformed);
 assert.ok(new T.Vector3(...result.point).applyQuaternion(q).add(shift).distanceTo(new T.Vector3(...other.point))<1e-10);
 assert.ok(Math.abs(result.axialTorque-other.axialTorque)<1e-10);assert.deepEqual(balance,before);
});

test('pure couple has no fictitious thrust line; overlay hides and releases geometry',()=>{
 const balance={com:[0,2,0],force:[0,0,0],torque:[100,0,0]};assert.equal(equivalentThrustLine(balance),null);
 const scene=new T.Scene(),craft=new T.Group();scene.add(craft);const overlay=mountThrustOverlay(scene);
 overlay.update(balance);const group=scene.getObjectByName('design-thrust-overlay');assert.equal(group.children.length,4);assert.equal(craft.children.length,0);
 let disposed=0;for(const c of group.children)c.geometry.addEventListener('dispose',()=>disposed++);
 overlay.update({...balance,force:[0,100,0]});assert.equal(disposed,4);assert.equal(group.children.length,7);
 overlay.update(null);assert.equal(group.visible,false);assert.equal(group.children.length,0);
 overlay.dispose();assert.equal(scene.children.length,1);
});
