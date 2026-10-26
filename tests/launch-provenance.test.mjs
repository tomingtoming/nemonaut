import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {part,preset} from '../dist/catalog.js';
import {launchWorld} from '../dist/world-operations.js';
import {worldFromFlight,flightFromWorld,validateWorld} from '../dist/world-save.js';
import {loadFlight,saveFlight} from '../dist/flight-save.js';
import {launchOrigins,surfaceOrigins} from '../dist/launch-provenance.js';
import {dockVessels,undockVessel} from '../dist/docking.js';
import {recordOrbitAchievements} from '../dist/exploration-history.js';
import {PLANET} from '../dist/planet.js';

test('real staging and save restoration retain launch provenance despite new vessel identities',()=>{
 const world=launchWorld(worldFromFlight(null),{parts:preset('launcher'),name:'Carrier',environment:'land'});
 const origins=launchOrigins(world.history),source=[world.history[0].id];
 let f=loadFlight(flightFromWorld(world));
 try{
  f.stageNext();f.stageNext();assert.equal(f.detached.length,1);assert.notEqual(f.detached[0].vesselId,f.vesselId);
  for(const v of [f,...f.detached])assert.deepEqual(surfaceOrigins(v.parts.map(p=>p.id),origins),source);
  const record=worldFromFlight(saveFlight(f),{history:world.history});f.dispose();f=loadFlight(flightFromWorld(record));
  for(const v of [f,...f.detached])assert.deepEqual(surfaceOrigins(v.parts.map(p=>p.id),launchOrigins(record.history)),source);
  assert.equal(surfaceOrigins([...f.parts.map(p=>p.id),'unproven'],origins),null);
  // Synthetic orbital fixture tests attribution, not launch performance.
  for(const v of [f,...f.detached]){v.pos.set(0,80000,0);v.q.identity();v.vel.set(0,0,Math.sqrt(PLANET.mu/680000));v.time=1;v.universalTime=1;v.landed=false;}
  const history=recordOrbitAchievements(record.history,f),awards=history.filter(e=>e.type==='orbit');
  assert.equal(awards.length,2);
  for(const event of awards){assert.deepEqual(event.launchEventIds,source);assert.equal(event.partIds.length,event.parts);}
  assert.deepEqual(worldFromFlight(saveFlight(f),{history}).history,history);
  for(const mutate of [w=>w.history.at(-1).launchEventIds=['missing'],w=>w.history.at(-1).partIds[0]='unknown']){
   const bad=worldFromFlight(saveFlight(f),{history});mutate(bad);assert.throws(()=>validateWorld(bad));
  }
 }finally{f.dispose();}
});

function craft(){const core=part('probe');return [core,part('dockingPort',[0,.321,0],[0,0,0],core.id)];}
test('docking cannot transfer surface provenance to practice parts; undocking restores per-part attribution',()=>{
 for(const secondEnvironment of ['land','orbit']){
  let world=launchWorld(worldFromFlight(null),{parts:craft(),name:'A',environment:'land'});
  world=launchWorld(world,{parts:craft(),name:'B',environment:secondEnvironment});
  const origins=launchOrigins(world.history);let f=loadFlight(flightFromWorld(world));
  try{
   const other=f.detached[0],port=f.parts.find(p=>p.type==='dockingPort'),otherPort=other.parts.find(p=>p.type==='dockingPort');
   const ownIds=f.parts.map(p=>p.id),otherIds=other.parts.map(p=>p.id);
   // Docking fixture, not an ascent test: align the two mating faces.
   f.q.identity();other.q.setFromAxisAngle(new T.Vector3(1,0,0),Math.PI);
   f.pos.set(0,80000,0);other.pos.set(0,80000+.884,0);f.vel.set(0,0,0);other.vel.set(0,0,0);f.omega.set(0,0,0);other.omega.set(0,0,0);
   f=dockVessels(f,other,port.id,otherPort.id);
   assert.deepEqual(new Set(f.parts.map(p=>p.id)),new Set([...ownIds,...otherIds]));
   assert.deepEqual(surfaceOrigins(f.parts.map(p=>p.id),origins),secondEnvironment==='land'?world.history.map(e=>e.id).sort():null);
   f=undockVessel(f,port.id);
   for(const v of [f,...f.detached]){
    const isB=v.parts.some(p=>ownIds.includes(p.id));
    assert.deepEqual(surfaceOrigins(v.parts.map(p=>p.id),origins),isB?(secondEnvironment==='land'?[world.history[1].id]:null):[world.history[0].id]);
   }
   const saved=worldFromFlight(saveFlight(f),{history:world.history});assert.deepEqual(validateWorld(saved).history,world.history);
  }finally{f.dispose();}
 }
});

test('history rejects duplicate births and inconsistent part evidence; legacy records remain readable',()=>{
 let world=launchWorld(worldFromFlight(null),{parts:craft(),name:'A',environment:'land'});
 world=launchWorld(world,{parts:craft(),name:'B',environment:'land'});
 const duplicate=structuredClone(world);duplicate.history[1].partIds[0]=duplicate.history[0].partIds[0];assert.throws(()=>validateWorld(duplicate),/重複/);
 for(const partIds of [[],['x','x'],[null,'y']]){const bad=structuredClone(world);bad.history[0].partIds=partIds;assert.throws(()=>validateWorld(bad));}
 const legacy=structuredClone(world);for(const e of legacy.history)delete e.partIds;
 assert.deepEqual(validateWorld(legacy).history,legacy.history);assert.equal(launchOrigins(legacy.history).size,0);
});
