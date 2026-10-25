import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {fleet,selectVessel} from '../dist/fleet.js';
import {launchIntoFleet} from '../dist/launch-fleet.js';
import {saveFlight,loadFlight} from '../dist/flight-save.js';
import {setTarget} from '../dist/relative-navigation.js';
import {dockVessels,undockVessel} from '../dist/docking.js';
import {worldFromFlight,validateWorld,flightFromWorld} from '../dist/world-save.js';

test('world retains two independent launches and resources while changing active vessel',()=>{
 const design=preset('rocket'),a=launchIntoFleet(null,{parts:design,name:'A',environment:'orbit',universalTime:4000});
 let b,c;
 try{
  a.stageNext();a.throttle=.25;for(let i=0;i<120;i++)a.step(1/120);a.throttle=0;
  b=launchIntoFleet(saveFlight(a),{parts:design,name:'B',environment:'land'});
  setTarget(b,b,b.detached[0]);
  const snapshot=saveFlight(b),world=worldFromFlight(snapshot),before=structuredClone(world);
  assert.equal(world.vessels.length,2);assert.equal(world.activeVesselId,b.vesselId);
  assert.ok(world.vessels.every(v=>!Object.hasOwn(v,'detached')));
  assert.notEqual(a.vesselId,b.vesselId);
  c=loadFlight(flightFromWorld(world,{activeVesselId:a.vesselId}));
  assert.equal(c.vesselId,a.vesselId);assert.equal(c.detached[0].vesselId,b.vesselId);
  assert.deepEqual([...c.fuel],[...a.fuel]);assert.deepEqual([...c.charge],[...a.charge]);assert.deepEqual([...c.thermal],[...a.thermal]);
  assert.deepEqual(c.pos.toArray(),a.pos.toArray());assert.equal(c.detached[0].navigationTarget,c);
  assert.equal(c.universalTime,a.universalTime);
  const again=worldFromFlight(saveFlight(c));assert.deepEqual(new Set(again.vessels.map(v=>v.vesselId)),new Set(world.vessels.map(v=>v.vesselId)));
  assert.deepEqual(world,before);assert.deepEqual(saveFlight(b),snapshot);
  design[0].p[0]=999;assert.notEqual(c.parts[0].p[0],999);
 }finally{a.dispose();b?.dispose();c?.dispose();}
});

test('staging, selection, docking and undocking have explicit persistent identities',()=>{
 let f=new Flight(preset('twin'),'orbit');
 try{
  const id=f.vesselId;f.stageNext();f.stageNext();assert.equal(f.vesselId,id);
  const child=f.detached[0],childId=child.vesselId;assert.notEqual(childId,id);
  f=selectVessel(f,child);assert.equal(f.vesselId,childId);assert.equal(f.detached[0].vesselId,id);
  const restored=loadFlight(saveFlight(f));try{assert.deepEqual(fleet(restored).map(v=>v.vesselId),fleet(f).map(v=>v.vesselId));}finally{restored.dispose();}
 }finally{f.dispose();}
 f=new Flight(preset('docking'),'orbit');
 try{
  const id=f.vesselId,port=f.parts.find(p=>p.dockPartner).id;
  f=undockVessel(f,port);assert.equal(f.vesselId,id);assert.notEqual(f.detached[0].vesselId,id);
  const child=f.detached[0],retired=child.vesselId,a=f.parts.find(p=>p.type==='dockingPort'),b=child.parts.find(p=>p.type==='dockingPort');
  f=dockVessels(f,child,a.id,b.id);assert.equal(f.vesselId,id);assert.ok(!fleet(f).some(v=>v.vesselId===retired));
  f=undockVessel(f,a.id);assert.equal(f.vesselId,id);assert.notEqual(f.detached[0].vesselId,retired);
  assert.equal(validateWorld(worldFromFlight(saveFlight(f))).vessels.length,2);
 }finally{f.dispose();}
});

test('legacy identity migration is deterministic and empty worlds retain universal time',()=>{
 const f=new Flight(preset('twin'),'orbit');
 try{
  f.stageNext();f.stageNext();f.step(1/120);const record=saveFlight(f);
  const strip=r=>{delete r.vesselId;delete r.universalTime;for(const c of r.detached)strip(c);};strip(record);
  const before=structuredClone(record),a=worldFromFlight(record),b=worldFromFlight(record);
  assert.deepEqual(a,b);assert.deepEqual(record,before);assert.equal(a.universalTime,f.time);
  const current=worldFromFlight(flightFromWorld(a));assert.deepEqual(current.vessels.map(v=>v.vesselId),a.vessels.map(v=>v.vesselId));
  const empty=validateWorld(worldFromFlight(null,{universalTime:12345}));assert.equal(empty.universalTime,12345);assert.equal(flightFromWorld(empty),null);
 }finally{f.dispose();}
});

test('world rejects invalid global identity, epoch and references without mutating input',()=>{
 const a=new Flight(preset('rocket'),'orbit');let b;
 try{
  b=launchIntoFleet(saveFlight(a),{parts:preset('rocket'),name:'B',environment:'orbit'});
  const world=worldFromFlight(saveFlight(b));
  for(const mutate of [w=>w.activeVesselId='missing',w=>w.vessels[0].vesselId=null,w=>w.vessels[1].vesselId=w.vessels[0].vesselId,w=>w.vessels[0].universalTime++,w=>w.vessels[0].detached=[],w=>w.vessels[0].targetPartId='missing',w=>w.vessels[0].fuel[0][1]=-1,w=>w.vessels[1].parts[0].id=w.vessels[0].parts[0].id]){
   const bad=structuredClone(world);mutate(bad);const before=structuredClone(bad);assert.throws(()=>validateWorld(bad));assert.deepEqual(bad,before);
  }
  const idle=structuredClone(world);idle.activeVesselId=null;assert.equal(validateWorld(idle).activeVesselId,null);
  const duplicate=saveFlight(b);duplicate.detached[0].vesselId=duplicate.vesselId;assert.throws(()=>loadFlight(duplicate));
 }finally{a.dispose();b?.dispose();}
});
