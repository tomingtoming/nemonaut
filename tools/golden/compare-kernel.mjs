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
