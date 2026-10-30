import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import R from '../../dist/vendor/rapier/rapier.mjs';
import {replay} from './replay-js.mjs';
import {assertGolden} from './compare.mjs';
// Test-only delegation: every Rapier step in the frozen Goldens is computed by the Rust Wasm
// world and written back to the JS body. The JS solver is never called; game logic stays JS.
const module=await WebAssembly.compile(await readFile(new URL('../../engine/target/wasm32-unknown-unknown/release/orbital_engine.wasm',import.meta.url)));
const baseline=JSON.parse((await readFile(new URL('../../tests/golden/js-v1.json',import.meta.url),'utf8')).replace(/^﻿/,''));
const vec=v=>[v.x,v.y,v.z];
const bodyState=b=>{const q=b.rotation();return [...vec(b.translation()),...vec(b.linvel()),q.x,q.y,q.z,q.w,...vec(b.angvel())];};
const worlds=new Map();let stats;
function single(world){
 const bodies=[];world.bodies.forEach(b=>bodies.push(b));assert.equal(bodies.length,1,'one craft body per world');
 const grounds=[];world.colliders.forEach(c=>{if(!c.parent())grounds.push(c);});assert.ok(grounds.length<=1,'at most one static ground');
 return {body:bodies[0],ground:grounds[0]};
}
function rust(world){
 let s=worlds.get(world);if(s)return s;
 const a=new WebAssembly.Instance(module,{}).exports;a.craft_reset();
 s={a,signature:null,index:new Map(),frames:0};worlds.set(world,s);return s;
}
function syncGround(a,g){if(!g)return;const q=g.rotation();assert.deepEqual(vec(g.halfExtents()),[2000,1,2000]);assert.equal(a.craft_ground(g.isEnabled()?1:0,...vec(g.translation()),q.x,q.y,q.z,q.w,g.friction()),1);}
const original={step:R.World.prototype.step,contactPair:R.World.prototype.contactPair};
R.World.prototype.step=function(){
 const {body,ground}=single(this),s=rust(this),a=s.a;syncGround(a,ground);
 const shapes=[];
 for(let i=0;i<body.numColliders();i++){
  const c=body.collider(i),p=c.translationWrtParent(),q=c.rotationWrtParent(),ball=c.shapeType()===R.ShapeType.Ball;
  assert.ok(ball||c.shapeType()===R.ShapeType.Cuboid,'only box/ball colliders are delegated');
  const h=ball?{x:c.radius(),y:0,z:0}:c.halfExtents();
  shapes.push({handle:c.handle,geometry:[ball?1:0,h.x,h.y,h.z,p.x,p.y,p.z,q.x,q.y,q.z,q.w],mass:c.mass(),friction:c.friction()});
 }
 const signature=JSON.stringify(shapes.map(s=>[s.handle,s.geometry,s.friction]));
 if(signature!==s.signature){
  if(s.signature!==null){assert.equal(a.craft_clear_shapes(),1);stats.rebuilds++;}
  for(const shape of shapes)assert.equal(a.craft_shape(...shape.geometry,shape.mass,shape.friction),1);
  s.signature=signature;s.index=new Map(shapes.map((shape,i)=>[shape.handle,i]));
 }
 shapes.forEach((shape,i)=>assert.equal(a.craft_mass(i,shape.mass),1));
 const p=this.integrationParameters;
 assert.equal(a.craft_state(...bodyState(body)),1);
 assert.equal(a.craft_solver_step(...vec(body.userForce()),...vec(body.userTorque()),...vec(this.gravity),this.timestep,p.lengthUnit,p.normalizedAllowedLinearError,p.normalizedPredictionDistance),1);
 const out=Array.from({length:13},(_,i)=>a.craft_read(i));assert.ok(out.every(Number.isFinite),'finite Rust state');
 assert.ok(Math.abs(a.craft_read(13)-body.mass())<.02,'mass parity');
 body.setTranslation({x:out[0],y:out[1],z:out[2]},true);body.setLinvel({x:out[3],y:out[4],z:out[5]},true);
 body.setRotation({x:out[6],y:out[7],z:out[8],w:out[9]},true);body.setAngvel({x:out[10],y:out[11],z:out[12]},true);
 s.frames++;stats.frames++;
 if(ground)for(let i=0;i<shapes.length;i++)if(a.craft_contact_count(i)>0){stats.contactFrames++;break;}
};
R.World.prototype.contactPair=function(collider,other,callback){
 const s=worlds.get(this),{ground}=single(this);assert.ok(s,'contact query on a world that never stepped through Rust');
 assert.ok(ground&&other.handle===ground.handle,'only craft-ground contact queries are delegated');
 const i=s.index.get(collider.handle);assert.ok(i!==undefined,'collider of the current craft shapes');
 const n=s.a.craft_contact_count(i);assert.ok(Number.isInteger(n)&&n>=0);stats.contactQueries++;
 if(n>0){stats.contactPoints+=n;callback({numContacts:()=>n,contactImpulse:k=>s.a.craft_contact_impulse(i,k)},false);}
};
const results=[];
try{
 for(const {definition:d,expected} of baseline.cases){
  stats={frames:0,rebuilds:0,contactFrames:0,contactQueries:0,contactPoints:0};worlds.clear();
  try{
   const result=assertGolden(expected,replay(d),{mode:d.mode,limits:baseline.tolerances});
   assert.ok(stats.frames>=d.ticks,'every tick stepped through Rust');
   const summary={case:d.name,mode:d.mode,ticks:d.ticks,frames:stats.frames,worlds:worlds.size,rebuilds:stats.rebuilds,contactFrames:stats.contactFrames,contactQueries:stats.contactQueries,contactPoints:stats.contactPoints,maxToleranceRatio:result.maxRatio,pass:true};
   results.push(summary);console.log(JSON.stringify(summary));
  }finally{for(const {a}of worlds.values())a.craft_dispose();}
 }
 assert.equal(results.length,8,'all frozen Golden cases');
 assert.ok(results.some(r=>r.worlds>1&&r.rebuilds>0),'staging/fracture must create and rebuild Rust worlds');
 assert.ok(results.filter(r=>r.case.endsWith('tank-impact')).every(r=>r.contactPoints>0),'ground impacts must read Rust contact impulses');
 assert.ok(results.some(r=>r.contactFrames>0),'some case must touch the ground in Rust');
}finally{Object.assign(R.World.prototype,original);}
