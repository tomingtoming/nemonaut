import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {relativeStopPlan} from '../dist/relative-stop-plan.js';import {maneuverPreview} from '../dist/maneuver.js';import {keplerDrift} from '../dist/coast-orbit.js';import {bodyOrbitState,bodyState} from '../dist/celestial.js';import {PLANET,center} from '../dist/planet.js';
const r=800000,s=Math.sqrt(PLANET.mu/r),axis=new T.Vector3(1,0,0),p=center.clone().add(new T.Vector3(0,r,0)),v=new T.Vector3(0,0,s),epoch=100;
function rotated(angle,reverse=false){return bodyOrbitState(p.clone().sub(center).applyAxisAngle(axis,angle).add(center),v.clone().applyAxisAngle(axis,angle).multiplyScalar(reverse?-1:1),epoch);}
test('Future closest-approach burn matches target velocity without moving craft',()=>{
 const own=bodyOrbitState(p,v,epoch),target=rotated(.6,true),before=own.r.clone(),plan=relativeStopPlan(own,target);
 assert.ok(plan.time>5);assert.ok(plan.time<own.period);assert.ok(plan.distance<.1);
 const preview=maneuverPreview(p,v,plan.location,plan.components,epoch),targetCoast=keplerDrift(target.r,target.relativeVelocity,target.body.mu,plan.time),future=bodyState(target.body,epoch+plan.time);
 assert.ok(preview.afterVel.distanceTo(targetCoast.velocity.add(future.velocity))<1e-6);assert.ok(preview.burnPos.distanceTo(targetCoast.position.add(future.position))<.1);assert.deepEqual(own.r,before);
});
test('Immediate separated craft retain position difference after velocity match',()=>{
 const own=bodyOrbitState(p,v,epoch),target=rotated(.2),plan=relativeStopPlan(own,target);assert.equal(plan.location,'now');assert.ok(plan.distance>100000);
 const preview=maneuverPreview(p,v,plan.location,plan.components,epoch);assert.ok(preview.afterVel.distanceTo(target.relativeVelocity)<1e-6);assert.deepEqual(preview.burnPos,p);
 assert.throws(()=>relativeStopPlan(own,own),/0.5/);assert.throws(()=>relativeStopPlan(own,{...target,bodyId:'moon'}));
});
