import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import RAPIER from '../../dist/vendor/rapier/rapier.mjs';
await RAPIER.init();
const bytes=await readFile(new URL('../../engine/target/wasm32-unknown-unknown/release/orbital_engine.wasm',import.meta.url));
const {instance}=await WebAssembly.instantiate(bytes,{});
const {fall_y}=instance.exports;
assert.equal(typeof fall_y,'function');
function reference(ticks,height,velocity,ground){
 const w=new RAPIER.World({x:0,y:-9.81,z:0});w.timestep=1/120;
 try{
  if(ground){const g=w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0,-.1,0));w.createCollider(RAPIER.ColliderDesc.cuboid(100,.1,100),g);}
  const b=w.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0,height,0).setLinvel(0,velocity,0));
  w.createCollider(RAPIER.ColliderDesc.ball(.5),b);
  for(let i=0;i<ticks;i++)w.step();
  return b.translation().y;
 }finally{w.free();}
}
// A deliberately tight kernel threshold, independent of full-flight Golden tolerances.
for(const c of [[0,5,0,0],[120,50,0,0],[240,50,3,0],[120,5,0,1],[600,5,-2,1]]){
 const expected=reference(...c),actual=fall_y(...c),delta=Math.abs(actual-expected);
 assert.ok(Number.isFinite(actual)&&delta<=.001,JSON.stringify({c,expected,actual,delta}));
 if(c[0]===600)assert.ok(Math.abs(actual-.5)<.01,'settled ball must rest on ground');
 console.log(JSON.stringify({case:c,expected,actual,delta,pass:true}));
}
for(const c of [[7201,0,0,0],[1,NaN,0,0],[1,0,Infinity,0],[1,0,0,2]])assert.ok(Number.isNaN(fall_y(...c)));
console.log('Invalid-input rejection: pass');

const api=instance.exports;
const snapshot=()=>Array.from({length:14},(_,i)=>api.kernel_read(i));
const cases=[
 {name:'force-release',height:50,ground:0,ticks:240,input:i=>[i<120?30:0,0,0,0,0,0,100,0]},
 {name:'torque-release',height:50,ground:0,ticks:240,input:i=>[0,0,0,0,i<120?2:0,0,100,0]},
 {name:'touchdown',height:5,ground:1,ticks:600,input:()=>[0,0,0,0,0,0,1,-9.81]},
 {name:'scale-transition',height:50,ground:0,ticks:240,input:i=>[10,5,-3,.1,.2,.3,i<120?1:100,-9.81]},
];
for(const c of cases){
 const world=new RAPIER.World({x:0,y:-9.81,z:0});world.timestep=1/120;world.numSolverIterations=8;
 try{
  if(c.ground)world.createCollider(RAPIER.ColliderDesc.cuboid(2000,1,2000).setTranslation(0,-1,0).setFriction(.3));
  const b=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0,c.height,0).setCanSleep(false).setCcdEnabled(true));
  world.createCollider(RAPIER.ColliderDesc.cuboid(.5,.4,.7).setMass(10),b);
  assert.equal(api.kernel_reset(c.height,c.ground),1);
  let maxDifference=0,releaseVelocity;
  for(let tick=0;tick<c.ticks;tick++){
   const input=c.input(tick),[fx,fy,fz,tx,ty,tz,scale,gravity]=input;
   world.integrationParameters.lengthUnit=scale;
   world.integrationParameters.normalizedAllowedLinearError=.001/scale;
   world.integrationParameters.normalizedPredictionDistance=.005/scale;
   world.gravity={x:0,y:gravity,z:0};
   b.resetForces(true);b.resetTorques(true);
   b.addForce({x:fx,y:fy,z:fz},true);b.addTorque({x:tx,y:ty,z:tz},true);
   world.step();assert.equal(api.kernel_step(...input),1);
   const p=b.translation(),v=b.linvel(),q=b.rotation(),w=b.angvel();
   const expected=[p.x,p.y,p.z,v.x,v.y,v.z,q.x,q.y,q.z,q.w,w.x,w.y,w.z,tick+1],actual=snapshot();
   for(let i=0;i<14;i++){
    const delta=Math.abs(actual[i]-expected[i]);maxDifference=Math.max(maxDifference,delta);
    assert.ok(Number.isFinite(actual[i])&&delta<=(i===13?0:.001),JSON.stringify({case:c.name,tick,index:i,actual:actual[i],expected:expected[i],delta}));
   }
   assert.ok(Math.abs(Math.hypot(...actual.slice(6,10))-1)<.0001,'unit rotation');
   if(c.name==='force-release'&&tick===119)releaseVelocity=actual[3];
  }
  const final=snapshot();
  if(c.name==='force-release'){assert.ok(Math.abs(releaseVelocity-3)<.001);assert.ok(Math.abs(final[3]-releaseVelocity)<.001,'released force must not accumulate');}
  if(c.name==='touchdown')assert.ok(Math.abs(final[1]-.4)<.01&&Math.abs(final[4])<.01,'resting height and speed');
  for(const bad of [[NaN,0,0,0,0,0,1,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,Infinity,0]]){assert.equal(api.kernel_step(...bad),0);assert.deepEqual(snapshot(),final);}
  assert.equal(api.kernel_reset(NaN,0),0);assert.deepEqual(snapshot(),final);
  assert.equal(api.kernel_reset(5,.5),0);assert.deepEqual(snapshot(),final);
  console.log(JSON.stringify({case:c.name,ticks:c.ticks,maxDifference,pass:true}));
 }finally{world.free();api.kernel_dispose();}
 assert.ok(Number.isNaN(api.kernel_read(0)));
 assert.equal(api.kernel_step(0,0,0,0,0,0,1,0),0);
}
const second=(await WebAssembly.instantiate(bytes,{})).instance.exports;
assert.equal(api.kernel_reset(5,0),1);assert.equal(second.kernel_reset(9,0),1);
assert.equal(api.kernel_read(1),5);assert.equal(second.kernel_read(1),9);
api.kernel_dispose();assert.equal(second.kernel_read(1),9);second.kernel_dispose();
console.log('Persistent state, force release, invalid-input atomicity, disposal and instance isolation: pass');
