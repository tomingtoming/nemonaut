import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Flight} from '../../dist/core.js';
import {preset} from '../../dist/catalog.js';
import R from '../../dist/vendor/rapier/rapier.mjs';
const bytes=await readFile(new URL('../../engine/target/wasm32-unknown-unknown/release/orbital_engine.wasm',import.meta.url));
const a=(await WebAssembly.instantiate(bytes,{})).instance.exports;
const vec=v=>[v.x,v.y,v.z];
function state(b){const q=b.rotation();return [...vec(b.translation()),...vec(b.linvel()),q.x,q.y,q.z,q.w,...vec(b.angvel())];}
const traces=[];
for(const name of ['orbiter','returner','plane']){
 const f=new Flight(preset(name),name==='plane'?'runway':'orbit');f.sas=false;
 if(name==='plane'){f.pos.y+=1000;f.vel.set(0,0,100);}
 if(name!=='orbiter'){f.stageNext();f.throttle=.35;}
 const trace={name,initialShapes:[],frames:[]};let maxDifference=0,nonzeroForce=0,nonzeroTorque=0;
 try{
  a.craft_reset();
  for(let i=0;i<f.body.numColliders();i++){
   const c=f.body.collider(i),p=c.translationWrtParent(),q=c.rotationWrtParent(),ball=c.shapeType()===R.ShapeType.Ball;
   assert.ok(ball||c.shapeType()===R.ShapeType.Cuboid);
   const h=ball?{x:c.radius(),y:0,z:0}:c.halfExtents();
   const shape=[ball?1:0,h.x,h.y,h.z,p.x,p.y,p.z,q.x,q.y,q.z,q.w,c.mass(),c.friction()];
   trace.initialShapes.push(shape);assert.equal(a.craft_shape(...shape),1);
  }
  const original=f.world.step.bind(f.world);
  f.world.step=(...args)=>{
   assert.ok(!f.ground||!f.ground.isEnabled(),'ground-enabled trace is not supported');
   assert.equal(f.body.numColliders(),trace.initialShapes.length,'topology changed');
   const masses=Array.from({length:f.body.numColliders()},(_,i)=>f.body.collider(i).mass());
   masses.forEach((m,i)=>assert.equal(a.craft_mass(i,m),1));
   const before=state(f.body),force=vec(f.body.userForce()),torque=vec(f.body.userTorque()),p=f.world.integrationParameters;
   const input=[...force,...torque,...vec(f.world.gravity),f.world.timestep,p.lengthUnit,p.normalizedAllowedLinearError,p.normalizedPredictionDistance];
   assert.equal(f.world.numSolverIterations,8);
   assert.equal(a.craft_state(...before),1);assert.equal(a.craft_solver_step(...input),1);
   original(...args);
   const after=state(f.body),observed=Array.from({length:13},(_,i)=>a.craft_read(i));
   for(let i=0;i<13;i++){
    const delta=Math.abs(after[i]-observed[i]),allowed=i<3?.05:i<6?.02:.002;
    maxDifference=Math.max(maxDifference,delta);
    assert.ok(Number.isFinite(observed[i])&&delta<=allowed,JSON.stringify({name,tick:trace.frames.length,i,actual:observed[i],expected:after[i],delta,allowed}));
   }
   if(Math.hypot(...force)>0)nonzeroForce++;if(Math.hypot(...torque)>0)nonzeroTorque++;
   trace.frames.push({before,masses,input,after});
  };
  for(let tick=0;tick<120;tick++)f.step(1/120,{pitch:tick<60?.2:0,yaw:.1});
  assert.equal(trace.frames.length,120);assert.ok(nonzeroTorque>0,'must exercise actual control torque');
  if(name!=='orbiter')assert.ok(nonzeroForce>0,'powered/airborne case must exercise actual force');
  const digest=createHash('sha256').update(JSON.stringify(trace)).digest('hex');
  console.log(JSON.stringify({case:name,frames:trace.frames.length,nonzeroForce,nonzeroTorque,maxDifference,traceSHA256:digest,pass:true}));traces.push(trace);
 }finally{f.dispose();a.craft_dispose();}
}
const root=new URL('../../artifacts/',import.meta.url);await mkdir(root,{recursive:true});
await writeFile(new URL('rust299-flight-solver-trace.json',root),JSON.stringify({version:1,source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),cases:traces}));
console.log('Live Flight solver inputs replayed; JS retains authoritative game state. Ground and topology changes excluded.');
