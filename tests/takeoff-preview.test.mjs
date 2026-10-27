import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight,statistics} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {saveFlight} from '../dist/flight-save.js';
import {TakeoffPrototype} from '../tools/takeoff-prototype.mjs';
import {previewTakeoff} from '../tools/takeoff-preview.mjs';
import {runwayApproach,RUNWAY} from '../dist/runway-navigation.js';

for(const fraction of [1,.5])test(`cargo forecast preserves live state and distinguishes runway capacity (${fraction} fuel)`,()=>{
 const f=new Flight(preset('transport-cargo'),'runway',161700);f.stageNext();
 for(const [id,v]of f.fuel)f.fuel.set(id,v*fraction);f.stats=statistics(f.parts,f.fuel,f.ballast,f.thermal);
 const p=new TakeoffPrototype(f,{speed:90,rotation:12,integral:true,handoff:'attitude'});
 try{
  let boundary=false;
  for(let i=0;i<30*120;i++){
   f.step(1/120,p.update(f,1/120));
   const r=runwayApproach(f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),f.universalTime,'09',f.vel),speed=f.telemetry.surfaceSpeed;
   if(f.telemetry.contacts&&RUNWAY.length+r.remaining<=speed*speed/12+speed*.5+50){boundary=true;break;}
  }
  assert.ok(boundary);const before=saveFlight(f),bias=p.pitchBias,phase=p.phase;
  const prediction=previewTakeoff(f,p);
  assert.deepEqual(saveFlight(f),before);assert.equal(p.pitchBias,bias);assert.equal(p.phase,phase);
  assert.equal(prediction.status,'airborne');assert.equal(prediction.lastGround.along<RUNWAY.length-75,fraction===.5);
  let actual=null;
  for(let i=0;i<20*120;i++){
   f.step(1/120,p.update(f,1/120));
   if(f.telemetry.contacts)actual=-runwayApproach(f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),f.universalTime,'09',f.vel).remaining;
   if(!f.telemetry.contacts&&f.orbit.altitude>10)break;
  }
  assert.equal(f.crashed,false);assert.ok(actual!==null);assert.ok(Math.abs(actual-prediction.lastGround.along)<1);
 }finally{f.dispose();}
});
