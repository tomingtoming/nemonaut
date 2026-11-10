import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Flight} from '../../dist/core.js';
import {preset} from '../../dist/catalog.js';
import R from '@dimforge/rapier3d-compat';
await R.init();
// The engine built with `--features diagnostics` (see .github/workflows/rust-kernel.yml); the game's Wasm lacks these exports.
const bytes=await readFile(process.env.ENGINE_DIAGNOSTICS_WASM||new URL('../../engine/target/orbital_engine_diagnostics.wasm',import.meta.url));
const a=(await WebAssembly.instantiate(bytes,{})).instance.exports;
const actual=()=>Array.from({length:19},(_,i)=>a.craft_read(i));
function snapshot(b,tick,count){const p=b.translation(),v=b.linvel(),q=b.rotation(),w=b.angvel(),c=b.localCom();return [p.x,p.y,p.z,v.x,v.y,v.z,q.x,q.y,q.z,q.w,w.x,w.y,w.z,b.mass(),c.x,c.y,c.z,tick,count];}
for(const name of ['rover','plane','plane-large','launcher']){
 const flight=new Flight(preset(name),'land'),world=new R.World({x:0,y:0,z:0});
 world.timestep=1/120;world.numSolverIterations=8;world.integrationParameters.lengthUnit=100;
 world.integrationParameters.normalizedAllowedLinearError=.001/100;world.integrationParameters.normalizedPredictionDistance=.005/100;
 const b=world.createRigidBody(R.RigidBodyDesc.dynamic().setCanSleep(false).setCcdEnabled(true)),shapes=[];
 try{
  a.craft_reset();
  for(let i=0;i<flight.body.numColliders();i++){
   const c=flight.body.collider(i),p=c.translationWrtParent(),q=c.rotationWrtParent(),ball=c.shapeType()===R.ShapeType.Ball;
   assert.ok(ball||c.shapeType()===R.ShapeType.Cuboid,'unsupported shape must fail explicitly');
   const h=ball?{x:c.radius(),y:0,z:0}:c.halfExtents();
   assert.equal(a.craft_shape(ball?1:0,h.x,h.y,h.z,p.x,p.y,p.z,q.x,q.y,q.z,q.w,c.mass(),c.friction()),1);
   const desc=ball?R.ColliderDesc.ball(h.x):R.ColliderDesc.cuboid(h.x,h.y,h.z);
   shapes.push(world.createCollider(desc.setTranslation(p.x,p.y,p.z).setRotation(q).setMass(c.mass()).setFriction(c.friction()).setRestitution(0),b));
  }
  b.recomputeMassPropertiesFromColliders();
  const initialMass=b.mass();let maxDifference=0;
  assert.ok(Math.abs(a.craft_read(13)-flight.body.mass())<.02);
  for(let tick=0;tick<240;tick++){
   if(tick===120){
    flight.fuelRatio=.25;flight.updateColliderMasses();
    shapes.forEach((c,i)=>{const mass=flight.body.collider(i).mass();c.setMass(mass);assert.equal(a.craft_mass(i,mass),1);});
   }
   b.recomputeMassPropertiesFromColliders();
   const com=b.worldCom(),force={x:tick<120?initialMass*.01:0,y:0,z:0},point={x:com.x,y:com.y+5,z:com.z};
   b.resetForces(true);b.resetTorques(true);b.addForceAtPoint(force,point,true);
   world.step();assert.equal(a.craft_step(force.x,force.y,force.z,point.x,point.y,point.z),1);
   const expected=snapshot(b,tick+1,shapes.length),observed=actual();
   for(let i=0;i<19;i++){
    const allowed=i<3?.05:i<6?.02:i<13?.002:i===13?.02:i<17?.002:0;
    const difference=Math.abs(expected[i]-observed[i]);maxDifference=Math.max(maxDifference,difference);
    assert.ok(Number.isFinite(observed[i])&&difference<=allowed,JSON.stringify({name,tick,i,expected:expected[i],actual:observed[i],difference,allowed}));
   }
  }
  assert.ok(Math.hypot(...actual().slice(10,13))>1e-6,'off-center force must produce rotation');
  const final=actual();assert.equal(a.craft_mass(9999,1),0);assert.equal(a.craft_mass(0,NaN),0);
  assert.equal(a.craft_step(NaN,0,0,0,0,0),0);assert.deepEqual(actual(),final);
  console.log(JSON.stringify({craft:name,colliders:shapes.length,initialMass,finalMass:actual()[13],ticks:240,maxDifference,pass:true}));
 }finally{flight.dispose();world.free();a.craft_dispose();}
 assert.ok(Number.isNaN(a.craft_read(0)));
}
console.log('Real preset colliders, changing mass/COM, off-center force and invalid commands: pass');
