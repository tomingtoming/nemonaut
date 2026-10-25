import {recordOrbitAchievements} from '../dist/exploration-history.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {preset} from '../dist/catalog.js';
import {LaunchPilot} from '../dist/launch-pilot.js';
import {ReturnPilot} from '../dist/return-pilot.js';
import {loadFlight,saveFlight} from '../dist/flight-save.js';
import {fleet} from '../dist/fleet.js';
import {worldFromFlight,flightFromWorld} from '../dist/world-save.js';
import {launchWorld,selectWorldVessel,retireWorldVessel} from '../dist/world-operations.js';
import {gameRecord,validateGame} from '../dist/game-save.js';

// Both vehicles actually depart from the rotating surface. Demonstration pilots
// use the same staging/throttle/SAS actuators; no positions or velocities are set.
test('surface-launched A survives B launch, orbit, return, recovery and whole-game reload',t=>{
 let world=launchWorld(worldFromFlight(null),{parts:preset('launcher'),name:'Satellite A',environment:'land'});
 const aId=world.activeVesselId;
 let f=loadFlight(flightFromWorld(world));
 try{
  const ascent=new LaunchPilot();
  for(let i=0;i<500*120&&!ascent.done&&!f.crashed;i++){ascent.update(f);f.step(1/120);}
  assert.ok(ascent.done,'A reaches orbit from ground');assert.ok(f.orbit.stable);assert.equal(f.crashed,false);
  const aFuel=[...f.fuel],aTime=f.time;
  const beforeHistory=structuredClone(world.history);
  const achieved=recordOrbitAchievements(world.history,f);assert.deepEqual(world.history,beforeHistory);
  assert.equal(achieved.at(-1).type,'orbit');assert.equal(achieved.at(-1).vesselId,aId);
  assert.equal(recordOrbitAchievements(achieved,f),achieved);
  assert.equal(recordOrbitAchievements(world.history,f,{practice:true}),world.history);
  world.history=recordOrbitAchievements(world.history,f);
  world=worldFromFlight(saveFlight(f),{history:world.history});f.dispose();f=null;
  const prior=structuredClone(world),draft={parts:preset('returner'),name:'Return B',bay:'vab',environment:'land'};
  world=launchWorld(world,draft);const bId=world.activeVesselId;
  assert.deepEqual(world.vessels.find(v=>v.vesselId===aId).pos,prior.vessels.find(v=>v.vesselId===aId).pos);
  f=loadFlight(flightFromWorld(world));const launchTime=f.universalTime,launch=new LaunchPilot();
  assert.ok(launchTime>100,'B begins at the epoch reached by A');
  for(let i=0;i<500*120&&!launch.done&&!f.crashed;i++){launch.update(f);f.step(1/120);}
  assert.ok(launch.done,'B reaches orbit from ground at the later epoch');assert.ok(f.orbit.stable);assert.equal(f.crashed,false);
  world.history=recordOrbitAchievements(world.history,f);
  world=worldFromFlight(saveFlight(f),{history:world.history});f.dispose();f=null;
  world=selectWorldVessel(world,aId).world;
  world=validateGame(JSON.parse(JSON.stringify(gameRecord({world,draft})))).world;
  assert.equal(world.activeVesselId,aId);
  world=selectWorldVessel(world,bId).world;f=loadFlight(flightFromWorld(world));
  const returning=new ReturnPilot();let opened=false;
  for(let i=0;i<2500*60&&!returning.done&&!f.crashed;i++){
   returning.update(f);f.step(1/60);opened||=[...f.chutes.values()].some(c=>c.status==='open');
  }
  assert.ok(returning.done,'B completes deorbit and landing');assert.ok(opened);assert.ok(f.landed);assert.equal(f.crashed,false);assert.equal(f.parts.length,3);
  const a=fleet(f).find(v=>v.vesselId===aId);assert.ok(a,'A remains in world');assert.ok(a.orbit.stable);assert.equal(a.crashed,false);assert.ok(a.time>aTime);assert.deepEqual([...a.fuel],aFuel);
  assert.ok(fleet(f).every(v=>v.universalTime===f.universalTime));
  world.history=recordOrbitAchievements(world.history,f);
  world=worldFromFlight(saveFlight(f),{history:world.history});f.dispose();f=null;
  world=selectWorldVessel(world,aId).world;
  const aBefore=structuredClone(world.vessels.find(v=>v.vesselId===aId)),count=world.vessels.length;
  const recovered=retireWorldVessel(world,bId,'recover');assert.equal(recovered.world.vessels.length,count-1);assert.equal(recovered.removed.action,'回収');
  const game=validateGame(JSON.parse(JSON.stringify(gameRecord({world:recovered.world,draft}))));
  assert.deepEqual(game.workshop,JSON.parse(JSON.stringify(draft)));assert.equal(game.world.activeVesselId,aId);assert.ok(!game.world.vessels.some(v=>v.vesselId===bId));assert.deepEqual(game.world.history.map(e=>e.type),['launch','orbit','launch','orbit','recover']);assert.equal(game.world.history.at(-1).vesselId,bId);
  const aAfter=game.world.vessels.find(v=>v.vesselId===aId);
  for(const key of ['vesselId','pos','vel','fuel','charge','thermal','state','universalTime'])assert.deepEqual(aAfter[key],aBefore[key]);
  f=loadFlight(flightFromWorld(game.world));assert.ok(f.orbit.stable);assert.equal(f.vesselId,aId);
  t.diagnostic(JSON.stringify({universalTime:game.world.universalTime,satellitePeriapsis:f.orbit.periapsis,satelliteApoapsis:f.orbit.apoapsis,retainedVessels:game.world.vessels.length,recovered:recovered.removed.name,parachuteOpened:opened}));
 }finally{f?.dispose();}
});
