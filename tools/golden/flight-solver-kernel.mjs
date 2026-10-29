import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Flight} from '../../dist/core.js';
import {preset} from '../../dist/catalog.js';
import R from '../../dist/vendor/rapier/rapier.mjs';
import {bodyUp} from '../../dist/celestial.js';
const bytes=await readFile(new URL('../../engine/target/wasm32-unknown-unknown/release/orbital_engine.wasm',import.meta.url));
const a=(await WebAssembly.instantiate(bytes,{})).instance.exports;
const vec=v=>[v.x,v.y,v.z];
function state(b){const q=b.rotation();return [...vec(b.translation()),...vec(b.linvel()),q.x,q.y,q.z,q.w,...vec(b.angvel())];}
function groundState(f){if(!f.ground)return null;const g=f.ground,q=g.rotation(),h=g.halfExtents();assert.deepEqual(vec(h),[2000,1,2000]);return [g.isEnabled()?1:0,...vec(g.translation()),q.x,q.y,q.z,q.w,g.friction()];}
const traces=[];
for(const name of ['orbiter','returner','plane','rover-ground','plane-touchdown']){
 const grounded=name==='rover-ground'||name==='plane-touchdown',kind=name==='rover-ground'?'rover':name==='plane-touchdown'?'plane':name;
 const f=new Flight(preset(kind),kind==='rover'?'land':kind==='plane'?'runway':'orbit');f.sas=false;
 if(name==='plane'){f.pos.y+=1000;f.vel.set(0,0,100);}
 if(name==='plane-touchdown'){const up=bodyUp(f.pos,0);f.pos.addScaledVector(up,.25);f.vel.addScaledVector(up,-2);}
 if(!grounded&&name!=='orbiter'){f.stageNext();f.throttle=.35;}
 if(name==='rover-ground'){f.stageNext();f.reactionEnabled=false;f.brake=false;}
 const trace={name,initialShapes:[],frames:[]};let maxDifference=0,nonzeroForce=0,nonzeroTorque=0,groundFrames=0,contactFrames=0;
 try{
  a.craft_reset();
  const initialGround=groundState(f);if(initialGround)assert.equal(a.craft_ground(...initialGround),1);
  for(let i=0;i<f.body.numColliders();i++){
   const c=f.body.collider(i),p=c.translationWrtParent(),q=c.rotationWrtParent(),ball=c.shapeType()===R.ShapeType.Ball;
   assert.ok(ball||c.shapeType()===R.ShapeType.Cuboid);
   const h=ball?{x:c.radius(),y:0,z:0}:c.halfExtents();
   const shape=[ball?1:0,h.x,h.y,h.z,p.x,p.y,p.z,q.x,q.y,q.z,q.w,c.mass(),c.friction()];
   trace.initialShapes.push(shape);assert.equal(a.craft_shape(...shape),1);
  }
  const original=f.world.step.bind(f.world);
  f.world.step=(...args)=>{
   const ground=groundState(f);if(ground){assert.equal(a.craft_ground(...ground),1);if(ground[0])groundFrames++;}
   assert.equal(f.body.numColliders(),trace.initialShapes.length,'topology changed');
   const masses=Array.from({length:f.body.numColliders()},(_,i)=>f.body.collider(i).mass());
   masses.forEach((m,i)=>assert.equal(a.craft_mass(i,m),1));
   const before=state(f.body),force=vec(f.body.userForce()),torque=vec(f.body.userTorque()),p=f.world.integrationParameters;
   const input=[...force,...torque,...vec(f.world.gravity),f.world.timestep,p.lengthUnit,p.normalizedAllowedLinearError,p.normalizedPredictionDistance];
   assert.equal(f.world.numSolverIterations,8);
   assert.equal(a.craft_state(...before),1);assert.equal(a.craft_solver_step(...input),1);
   original(...args);
   let contacts=0;
   if(f.ground?.isEnabled())f.world.contactPairsWith(f.ground,c=>f.world.contactPair(f.ground,c,m=>{contacts+=m.numSolverContacts();}));
   if(contacts>0)contactFrames++;
   const after=state(f.body),observed=Array.from({length:13},(_,i)=>a.craft_read(i));
   for(let i=0;i<13;i++){
    const delta=Math.abs(after[i]-observed[i]),allowed=i<3?.05:i<6?.02:.002;
    maxDifference=Math.max(maxDifference,delta);
    assert.ok(Number.isFinite(observed[i])&&delta<=allowed,JSON.stringify({name,tick:trace.frames.length,i,actual:observed[i],expected:after[i],delta,allowed}));
   }
   if(Math.hypot(...force)>0)nonzeroForce++;if(Math.hypot(...torque)>0)nonzeroTorque++;
   trace.frames.push({before,masses,input,ground,contacts,after});
  };
  const ticks=name==='rover-ground'?1200:name==='plane-touchdown'?480:120;
  for(let tick=0;tick<ticks;tick++){
   if(name==='rover-ground'&&tick===720)f.brake=true;
   const input=name==='rover-ground'?{drive:tick<720?1:0,yaw:tick>=240&&tick<600?.3:0}:name==='plane-touchdown'?{}:{pitch:tick<60?.2:0,yaw:.1};
   f.step(1/120,input);
  }
  if(!grounded){assert.equal(trace.frames.length,120);assert.ok(nonzeroTorque>0,'must exercise actual control torque');}
  else {assert.ok(trace.frames.length>100);assert.ok(groundFrames>100);assert.equal(f.crashed,false,'gentle ground cases must remain intact');}
  if(name==='plane-touchdown')assert.ok(contactFrames>0,'touchdown must exercise Rapier contact');
  if(name!=='orbiter')assert.ok(nonzeroForce>0,'case must exercise actual force');
  const digest=createHash('sha256').update(JSON.stringify(trace)).digest('hex');
  console.log(JSON.stringify({case:name,frames:trace.frames.length,groundFrames,contactFrames,nonzeroForce,nonzeroTorque,maxDifference,traceSHA256:digest,pass:true}));traces.push(trace);
 }finally{f.dispose();a.craft_dispose();}
}
const root=new URL('../../artifacts/',import.meta.url);await mkdir(root,{recursive:true});
await writeFile(new URL('rust299-flight-solver-trace.json',root),JSON.stringify({version:1,source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),cases:traces}));
console.log('Live Flight solver inputs including ground replayed; JS retains authoritative game state. Topology changes excluded.');
