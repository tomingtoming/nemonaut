import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadFlight,saveFlight} from '../../dist/flight-save.js';
import {WorldRuntime} from '../../dist/world-runtime.js';
import {fleet} from '../../dist/fleet.js';
import R from '../../dist/vendor/rapier/rapier.mjs';
import {snapshot} from './replay-js.mjs';
import {assertGolden} from './compare.mjs';
const module=await WebAssembly.compile(await readFile(new URL('../../engine/target/wasm32-unknown-unknown/release/orbital_engine.wasm',import.meta.url)));
const baseline=JSON.parse(await readFile(new URL('../../tests/golden/js-v1.json',import.meta.url),'utf8'));
const vec=v=>[v.x,v.y,v.z];
const bodyState=b=>{const q=b.rotation();return [...vec(b.translation()),...vec(b.linvel()),q.x,q.y,q.z,q.w,...vec(b.angvel())];};
for(const test of baseline.cases.filter(c=>['orbital-stage-resources','fuel-tank-impact'].includes(c.definition.name))){
 const {definition:d,expected}=test;let f=loadFlight(d.initial),runtime=new WorldRuntime(f),input={};
 const ids=fleet(f).flatMap(v=>v.parts.map(p=>p.id)),labels=new Map(ids.map((id,i)=>[id,'p'+String(i).padStart(3,'0')]));
 const shadows=new Map(),samples=[];let frames=0,rebuilds=0,maxFleet=1,maxDifference=0,previousFuel=Infinity;
 function watch(v){
  if(shadows.has(v.world))return;
  const a=new WebAssembly.Instance(module,{}).exports; a.craft_reset();
  const shadow={a,signature:null,frames:0};shadows.set(v.world,shadow);
  function ground(){if(!v.ground)return;const g=v.ground,q=g.rotation();assert.deepEqual(vec(g.halfExtents()),[2000,1,2000]);assert.equal(a.craft_ground(g.isEnabled()?1:0,...vec(g.translation()),q.x,q.y,q.z,q.w,g.friction()),1);}
  ground();const original=v.world.step.bind(v.world);
  v.world.step=(...args)=>{
   const owners=new Map();
   for(const [id,group]of v.colliderGroups)for(const {collider}of group){assert.ok(!owners.has(collider.handle));owners.set(collider.handle,id);}
   const shapes=[];
   for(let i=0;i<v.body.numColliders();i++){
    const c=v.body.collider(i),id=owners.get(c.handle);assert.ok(labels.has(id)&&v.parts.some(p=>p.id===id),'collider owner is a current part');
    const p=c.translationWrtParent(),q=c.rotationWrtParent(),ball=c.shapeType()===R.ShapeType.Ball;
    assert.ok(ball||c.shapeType()===R.ShapeType.Cuboid);
    const h=ball?{x:c.radius(),y:0,z:0}:c.halfExtents();
    shapes.push({id,handle:c.handle,geometry:[ball?1:0,h.x,h.y,h.z,p.x,p.y,p.z,q.x,q.y,q.z,q.w],mass:c.mass(),friction:c.friction()});
   }
   assert.equal(new Set(shapes.map(s=>s.id)).size,v.parts.length,'each part has collision geometry');
   const signature=JSON.stringify(shapes.map(s=>[s.id,s.handle,s.geometry,s.friction]));
   if(signature!==shadow.signature){
    if(shadow.signature!==null){assert.equal(a.craft_clear_shapes(),1);rebuilds++;}
    for(const s of shapes)assert.equal(a.craft_shape(...s.geometry,s.mass,s.friction),1);
    shadow.signature=signature;
   }
   ground();shapes.forEach((s,i)=>assert.equal(a.craft_mass(i,s.mass),1));
   const before=bodyState(v.body),p=v.world.integrationParameters;
   assert.equal(a.craft_state(...before),1);
   assert.equal(a.craft_solver_step(...vec(v.body.userForce()),...vec(v.body.userTorque()),...vec(v.world.gravity),v.world.timestep,p.lengthUnit,p.normalizedAllowedLinearError,p.normalizedPredictionDistance),1);
   original(...args);const after=bodyState(v.body);
   for(let i=0;i<13;i++){
    const actual=a.craft_read(i),delta=Math.abs(actual-after[i]),allowed=i<3?.05:i<6?.02:.002;
    maxDifference=Math.max(maxDifference,delta);assert.ok(Number.isFinite(actual)&&delta<=allowed,JSON.stringify({case:d.name,frame:frames,i,actual,expected:after[i],delta,allowed}));
   }
   assert.ok(Math.abs(a.craft_read(13)-v.body.mass())<.02,'mass parity');shadow.frames++;frames++;
  };
 }
 try{
  for(let tick=0;tick<=d.ticks;tick++){
   const vessels=fleet(f),partIds=vessels.flatMap(v=>v.parts.map(p=>p.id));
   assert.deepEqual([...partIds].sort(),[...ids].sort(),'parts neither lost nor duplicated');
   let fuel=0;for(const v of vessels){assert.equal(v.universalTime,f.universalTime);for(const amount of v.fuel.values()){assert.ok(Number.isFinite(amount)&&amount>=0);fuel+=amount;}}
   assert.ok(fuel<=previousFuel+1e-7);previousFuel=fuel;maxFleet=Math.max(maxFleet,vessels.length);
   if(d.checkpoints.includes(tick))samples.push(snapshot(f,labels,tick));if(tick===d.ticks)break;
   for(const action of d.actions.filter(a=>a.tick===tick)){
    if(action.kind==='stage'){f.stageNext();runtime.replace(f);}
    else if(action.kind==='set')Object.assign(f,action.value);
    else if(action.kind==='input')input={...action.value};
    else if(action.kind==='restore'){const next=loadFlight(saveFlight(f));f.dispose();f=next;runtime=new WorldRuntime(f);}
    else throw Error('unsupported recorded action');
   }
   for(const v of fleet(f))watch(v);
   runtime.step(d.dt,input);
  }
  assertGolden(expected,{name:d.name,mode:d.mode,samples},{mode:d.mode,limits:baseline.tolerances});
  assert.ok(maxFleet>1&&shadows.size>1&&frames>100,'must exercise multiple worlds');
  assert.ok(rebuilds>0,'must exercise shape changes in an existing world');
  assert.ok([...shadows.values()].filter(s=>s.frames>0).length>1,'detached worlds must actually step');
  console.log(JSON.stringify({case:d.name,frames,worlds:shadows.size,maxFleet,rebuilds,maxDifference,golden:true,pass:true}));
 }finally{f.dispose();for(const {a}of shadows.values())a.craft_dispose();}
}
