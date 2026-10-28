import test from 'node:test';import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';import {preset} from '../dist/catalog.js';
import {WorldRuntime} from '../dist/world-runtime.js';
import {AscentSession} from '../dist/orbital-ascent-controller.js';
import {saveFlight,loadFlight} from '../dist/flight-save.js';
test('bundled ascent stages before registry refresh and advances every vessel on the same clock',()=>{
 const f=new Flight(preset('launcher'),'land',1413.8),other=new Flight(preset('rover'),'land',1413.8);other.pos.x+=1000;f.detached.push(other);
 const world=new WorldRuntime(f),session=new AscentSession();let restored;const originalIds=[...f.parts,...other.parts].map(p=>p.id).sort();
 try{
  session.start(f,{altitude:120000,inclination:90});
  for(let i=0;i<1201*120&&session.owner;i++){
   session.step(f,1/120);world.replace(f);world.step(1/120);
  }
  assert.equal(session.state,'complete');assert.equal(f.stage,1);assert.ok(world.vessels.size>=3);assert.deepEqual([...world.vessels.values()].flatMap(v=>v.parts.map(p=>p.id)).sort(),originalIds);assert.equal(world.vessels.get(other.vesselId),other);
  for(const v of world.vessels.values())assert.equal(v.universalTime,world.universalTime);
  assert.ok(f.orbit.periapsis>=118000);assert.ok(f.orbit.apoapsis<=122000);
  restored=loadFlight(saveFlight(f));const saved=new WorldRuntime(restored);assert.equal(saved.vessels.size,world.vessels.size);assert.equal(saved.universalTime,world.universalTime);
 }finally{restored?.dispose();f.dispose();}
});
