import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {Flight} from '../dist/core.js';import {preset} from '../dist/catalog.js';import {partMass} from '../dist/aero.js';
import {WorldRuntime} from '../dist/world-runtime.js';import {fleet} from '../dist/fleet.js';
import {resolveVesselCollisions} from '../dist/vessel-collision.js';import {inertiaAbout} from '../dist/docking.js';import {centerOfVessel} from '../dist/relative-navigation.js';

// Two orbiters side by side along A's local X; B approaches A at `speed`. Their solar panels
// reach x=±2.6 m, so the panels touch first at a center gap of 5.2 m.
function pair(gap,speed){
 const a=new Flight(preset('orbiter'),'orbit'),b=new Flight(preset('orbiter'),'orbit');a.sas=b.sas=false;
 const axis=new T.Vector3(1,0,0).applyQuaternion(a.q);
 b.pos.copy(a.pos).addScaledVector(axis,gap);b.q.copy(a.q);b.vel.copy(a.vel).addScaledVector(axis,-speed);b.omega.copy(a.omega);
 a.detached.push(b);return {a,b,axis};
}
const dt=1/120,mass=v=>v.parts.reduce((s,p)=>s+partMass(p,v.fuel,v.ballast,v.thermal),0);
function momentum(vs){
 const total=vs.reduce((s,v)=>s+mass(v),0),center=vs.reduce((c,v)=>c.addScaledVector(centerOfVessel(v),mass(v)),new T.Vector3()).divideScalar(total);
 const linear=new T.Vector3(),angular=new T.Vector3();
 for(const v of vs){const m=mass(v),c=centerOfVessel(v),p=v.vel.clone().multiplyScalar(m);linear.add(p);angular.add(v.omega.clone().applyMatrix3(inertiaAbout(v,c))).add(c.clone().sub(center).cross(p));}
 return {linear,angular};
}
test('vessel contact impulses stop the approach and conserve linear and angular momentum',()=>{
 const {a,b,axis}=pair(8,2);
 try{
  assert.equal(resolveVesselCollisions([a,b],dt).length,0,'apart but within broad range: nothing to resolve');
  // Panel tips 5 mm apart (inside the prediction distance, no positional correction), offset
  // vertically so the impulse also produces rotation.
  b.pos.copy(a.pos).addScaledVector(axis,5.205).add(new T.Vector3(0,.3,0).applyQuaternion(a.q));
  const before=momentum([a,b]),events=resolveVesselCollisions([a,b],dt),after=momentum([a,b]);
  assert.equal(events.length,1);assert.ok(events[0].contacts>0);assert.ok(Math.abs(events[0].speed-2)<.2,'approach speed at contact');
  assert.ok(after.linear.distanceTo(before.linear)<1e-6*before.linear.length(),'linear momentum conserved');
  assert.ok(after.angular.distanceTo(before.angular)<1e-6*Math.max(1,before.angular.length())+1e-3,'angular momentum conserved');
  assert.ok(a.omega.length()>1e-6||b.omega.length()>1e-6,'off-center contact spins the vessels');
  // The impulse limits the approach at the contact point (above the centers of mass), so the
  // centers still close but more slowly; the rest goes into rotation.
  assert.ok(b.vel.clone().sub(a.vel).dot(axis)>-1.9,'approach slowed by the contact');
  assert.equal(fleet(a).flatMap(v=>v.failureEvents).length,0,'2 m/s is not a damaging impact');
 }finally{a.dispose();}
});
test('vessels approaching in orbit do not pass through each other',()=>{
 const {a,b,axis}=pair(6,2),runtime=new WorldRuntime(a);
 try{
  let minimum=Infinity;
  for(let i=0;i<600;i++){runtime.step(1/120,{});minimum=Math.min(minimum,b.pos.clone().sub(a.pos).dot(axis));}
  // The panel tips touch first (5.2 m) above the centers of mass, so the hit spins both vessels
  // and the panels swing aside; the hulls (1.25 m wide) must still stop each other.
  assert.ok(minimum>1.25,'hulls never pass through each other: '+minimum);
  assert.ok(b.vel.clone().sub(a.vel).dot(axis)>-.01,'no longer approaching after 5 s');
  assert.ok(a.omega.length()>1e-4,'the off-center panel hit spins the vessels');
  assert.equal(fleet(a).length,2);assert.equal(fleet(a).flatMap(v=>v.failureEvents).length,0);
 }finally{a.dispose();}
});
test('a fast collision breaks parts on both vessels through the impact failure path',()=>{
 const {a,b}=pair(6,30),runtime=new WorldRuntime(a);
 try{
  for(let i=0;i<120;i++)runtime.step(1/120,{});
  const events=fleet(a).flatMap(v=>v.failureEvents);
  assert.ok(events.length>=2&&events.every(e=>e.cause==='impact'),JSON.stringify(events.map(e=>e.cause)));
  assert.ok(new Set(events.map(e=>e.partId)).size>=2,'one part on each vessel');
  assert.ok(fleet(a).length>2,'damaged vessels fracture');
 }finally{a.dispose();}
});
test('a pair already touching when first seen does not collide until it separates',()=>{
 const {a,b,axis}=pair(5.17,0);
 try{
  b.vel.copy(a.vel).addScaledVector(axis,-1);
  const v=b.vel.clone();
  assert.equal(resolveVesselCollisions([a,b],dt).length,0);assert.ok(b.vel.equals(v),'fresh contact is ignored');
  b.pos.copy(a.pos).addScaledVector(axis,8);assert.equal(resolveVesselCollisions([a,b],dt).length,0);
  b.pos.copy(a.pos).addScaledVector(axis,5.17);assert.equal(resolveVesselCollisions([a,b],dt).length,1,'collides after separating once');
 }finally{a.dispose();}
});
test('a rover rolling into a parked rover pushes it instead of passing through or being frozen',async()=>{
 const {referenceBody}=await import('../dist/celestial.js'),{surfaceRelativeVelocity}=await import('../dist/surface-frame.js'),{isParked}=await import('../dist/ground-rest.js');
 const a=new Flight(preset('rover'),'land');a.brake=true;const settle=new WorldRuntime(a);for(let i=0;i<240;i++)settle.step(dt,{});
 assert.ok(isParked(a),'target rover starts parked');
 const b=new Flight(preset('rover'),'land');b.universalTime=a.universalTime;b.time=a.time;const axis=new T.Vector3(1,0,0).applyQuaternion(a.q);
 b.pos.copy(a.pos).addScaledVector(axis,4);b.q.copy(a.q);b.vel.copy(a.vel).addScaledVector(axis,-9);a.detached.push(b);
 const runtime=new WorldRuntime(a),surface=v=>surfaceRelativeVelocity(centerOfVessel(v),v.vel,v.universalTime,referenceBody(v.pos,v.universalTime));
 try{
  let minimum=Infinity,pushed=0,unparked=false;
  for(let i=0;i<360;i++){runtime.step(dt,{});minimum=Math.min(minimum,b.pos.clone().sub(a.pos).dot(axis));pushed=Math.min(pushed,surface(a).dot(axis));unparked||=!isParked(a);}
  assert.ok(minimum>1.5,'rovers do not pass through each other: '+minimum);
  assert.ok(pushed<-.2,'the parked rover is pushed away from the impact: '+pushed);assert.ok(unparked,'the hit releases the parked state');
  assert.ok(surface(a).length()<.05&&surface(b).length()<.05,'both come to rest afterwards');
  assert.equal(fleet(a).flatMap(v=>v.failureEvents).length,0,'a roll-in that has slowed below 9 m/s is not a damaging impact');
 }finally{a.dispose();}
});
