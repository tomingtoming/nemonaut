import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import R from '@dimforge/rapier3d-compat';
import P,{installPhysics} from '../dist/physics.js';

// Oracle: JS Rapier 0.21 with its own solver (no Rust installed on this module instance, the
// preload installs on the vendor copy). The facade must give the very same numbers.
await R.init();
installPhysics(await WebAssembly.compile(readFileSync(new URL('../dist/engine/orbital_engine.wasm',import.meta.url))));

const v=o=>[o.x,o.y,o.z],q=o=>[o.x,o.y,o.z,o.w];
function scene(L){
 const world=new L.World({x:0,y:-9.81,z:0});world.numSolverIterations=8;
 const p=world.integrationParameters;p.lengthUnit=100;p.normalizedAllowedLinearError=.001/100;p.normalizedPredictionDistance=.005/100;
 const ground=world.createCollider(L.ColliderDesc.cuboid(2000,1,2000).setTranslation(0,-1,0).setFriction(.3));
 const body=world.createRigidBody(L.RigidBodyDesc.dynamic().setTranslation(0,1.8,0).setCanSleep(false).setCcdEnabled(true));
 const s=Math.SQRT1_2;
 const parts=[
  L.ColliderDesc.cuboid(.6,1.2,.6).setTranslation(0,.4,0).setRotation({x:0,y:0,z:0,w:1}).setMass(800).setFriction(.35).setRestitution(0),
  L.ColliderDesc.cuboid(2.5,.05,.4).setTranslation(1.3,-.2,.1).setRotation({x:0,y:.1305262,z:0,w:.9914449}).setMass(120).setFriction(.35).setRestitution(0),
  L.ColliderDesc.ball(.35).setTranslation(-.8,-1.1,.5).setRotation({x:s,y:0,z:0,w:s}).setMass(40).setFriction(.015).setRestitution(0),
 ].map(d=>world.createCollider(d,body));
 body.recomputeMassPropertiesFromColliders();
 return {world,ground,body,parts};
}
function drive(L,{world,ground,body,parts},log){
 for(let tick=0;tick<240;tick++){
  const a=tick*.01;
  ground.setEnabled(true);ground.setTranslation({x:.1*a,y:-1-.001*tick,z:0});ground.setRotation({x:.01,y:0,z:.002*a,w:1.0001});
  body.setRotation({x:.02*Math.sin(a),y:.1,z:0,w:1});
  if(tick%60===0){body.setLinvel({x:.3,y:-.5,z:0},true);body.setAngvel({x:0,y:.2,z:.05},true);}
  parts[0].setMass(800-tick*.7);body.recomputeMassPropertiesFromColliders();
  body.resetForces(true);body.resetTorques(true);
  const at=body.translation();
  body.addForceAtPoint({x:30,y:6000+tick,z:-5},{x:at.x+.2,y:at.y-1,z:at.z+.05},true);
  body.addForceAtPoint({x:-12,y:0,z:4},{x:at.x-1,y:at.y,z:at.z},true);
  body.addTorque({x:0,y:15,z:-3},true);
  log.push(['mass',body.mass(),...v(body.localCom()),...v(body.worldCom()),...v(body.principalInertia()),...q(body.principalInertiaLocalFrame())]);
  log.push(['forces',...v(body.userForce()),...v(body.userTorque()),...q(body.rotation())]);
  world.timestep=1/120;world.step();
  log.push(['state',...v(body.translation()),...v(body.linvel()),...q(body.rotation()),...v(body.angvel())]);
  for(const c of parts)world.contactPair(c,ground,m=>{if(!m.numContacts())return;const r=['contact',c.handle===parts[0].handle?0:c.handle===parts[1].handle?1:2,m.numContacts()];for(let i=0;i<m.numContacts();i++)r.push(m.contactImpulse(i));log.push(r);});
 }
}
test('the facade reproduces JS Rapier bit for bit: mass properties, forces, steps and contacts',()=>{
 const expected=[],actual=[];
 const a=scene(R),b=scene(P);
 for(const [x,y] of [[a,b]])for(let i=0;i<3;i++){
  assert.deepEqual(v(y.parts[i].translationWrtParent()),v(x.parts[i].translationWrtParent()));
  assert.deepEqual(q(y.parts[i].rotationWrtParent()),q(x.parts[i].rotationWrtParent()));
  assert.equal(y.parts[i].shapeType(),x.parts[i].shapeType());
 }
 drive(R,a,expected);drive(P,b,actual);
 assert.ok(expected.some(r=>r[0]==='contact'),'the scene touches the ground');
 assert.equal(actual.length,expected.length);
 for(let i=0;i<expected.length;i++)assert.deepEqual(actual[i],expected[i],'row '+i);
 a.world.free();b.world.free();
});
test('rebuilding all part colliders, and unsupported uses failing loudly',()=>{
 const {world,body,parts}=scene(P);
 for(const c of parts)world.removeCollider(c,true);
 world.createCollider(P.ColliderDesc.ball(.5).setMass(10).setFriction(.5).setRestitution(0),body);
 body.recomputeMassPropertiesFromColliders();
 assert.equal(body.numColliders(),1);assert.equal(body.mass(),10);
 const other=scene(P);
 world.removeCollider(body.collider(0),true);other.world.removeCollider(other.parts[0],true);
 assert.throws(()=>other.world.step(),/only removing every part collider/);
 assert.throws(()=>P.ColliderDesc.ball(1).setRestitution(.5),/restitution/);
 assert.throws(()=>world.createCollider(P.ColliderDesc.ball(1)),/static collider/);
 world.free();other.world.free();
});
