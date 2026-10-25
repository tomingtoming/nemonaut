import test from 'node:test';
import assert from 'node:assert/strict';
import {recordOrbitAchievements} from '../dist/exploration-history.js';
import {preset} from '../dist/catalog.js';
import {launchWorld} from '../dist/world-operations.js';
import {worldFromFlight,flightFromWorld,validateWorld} from '../dist/world-save.js';
import {loadFlight} from '../dist/flight-save.js';

test('practice placement, legacy craft and stale display orbits cannot earn surface-launch achievements',()=>{
 for(const environment of ['orbit','moon-orbit','land']){
  const world=launchWorld(worldFromFlight(null),{parts:preset('rocket'),name:'Test',environment});
  const f=loadFlight(flightFromWorld(world));
  try{
   f.step(1/120);
   // A stale HUD cache must not turn a stationary surface craft into an orbiter.
   f.orbit={bodyId:'planet',stable:true,periapsis:80000,apoapsis:80000};
   assert.equal(recordOrbitAchievements(world.history,f),world.history);
   assert.deepEqual(recordOrbitAchievements([],f),[]);
   const legacy=world.history.map(({environment,...event})=>event);
   assert.equal(recordOrbitAchievements(legacy,f),legacy);
  }finally{f.dispose();}
 }
});

test('saved orbit evidence requires a surface departure, valid apsides and no duplicate achievement',()=>{
 const world=launchWorld(worldFromFlight(null),{parts:preset('rocket'),name:'Test',environment:'land'});
 world.universalTime=10;for(const v of world.vessels)v.universalTime=10;
 const event={...world.history[0],id:crypto.randomUUID(),type:'orbit',missionTime:10,universalTime:10,orbit:{bodyId:'planet',periapsis:80000,apoapsis:100000}};delete event.environment;
 world.history.push(event);assert.deepEqual(validateWorld(world).history,world.history);
 for(const mutate of [
  w=>w.history[0].environment='orbit',w=>delete w.history[0].environment,
  w=>w.history[1].orbit.periapsis=70000,w=>w.history[1].orbit.apoapsis=Infinity,
  w=>w.history[1].orbit.apoapsis=75000,w=>w.history[1].orbit.bodyId='moon',
  w=>w.history.push({...w.history[1],id:crypto.randomUUID()})
 ]){const bad=structuredClone(world);mutate(bad);assert.throws(()=>validateWorld(bad));}
});
