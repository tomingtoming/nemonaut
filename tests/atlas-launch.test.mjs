import test from 'node:test';import assert from 'node:assert/strict';
import {preset} from '../dist/catalog.js';import {LaunchPilot} from '../dist/launch-pilot.js';
import {saveFlight,loadFlight} from '../dist/flight-save.js';import {launchWorld} from '../dist/world-operations.js';
import {worldFromFlight,flightFromWorld} from '../dist/world-save.js';import {PRIMARY_ROTATION_PERIOD} from '../dist/surface-frame.js';

for(const time of [0,PRIMARY_ROTATION_PERIOD/4])test(`Atlas regulates thrust into a bound orbit, then separates and saves at UT ${time}`,()=>{
 const world=launchWorld(worldFromFlight(null,{universalTime:time}),{parts:preset('atlas'),environment:'land',name:'Atlas'});
 const f=loadFlight(flightFromWorld(world)),pilot=new LaunchPilot();let restored,throttled=false;
 try{
  for(let i=0;i<600*120&&!pilot.done&&!f.crashed;i++){pilot.update(f);if(f.throttle>0&&f.throttle<.9)throttled=true;f.step(1/120);}
  assert.equal(pilot.done,true);assert.equal(pilot.phase,'周回達成');assert.equal(f.crashed,false);assert.ok(throttled);
  assert.ok(f.orbit.periapsis>75000);assert.ok(f.orbit.apoapsis<110000);assert.ok(f.orbit.energy<0);assert.equal(f.throttle,0);
  // Atlas has enough booster delta-v to arrive before stage depletion. Do not
  // burn or discard useful propellant just to force the demonstration to stage.
  assert.equal(f.stage,0);for(const p of f.parts.filter(p=>p.type==='tank'))assert.equal(f.fuel.get(p.id),1800);
  f.stageNext();assert.equal(f.stage,1);assert.ok(f.parts.some(p=>p.type==='engineVacMedium'));assert.equal(f.parts.some(p=>p.type==='tankLarge'),false);
  restored=loadFlight(saveFlight(f));const fuel=[...restored.fuel];
  for(let i=0;i<120*60;i++)restored.step(1/120);
  assert.equal(restored.crashed,false);assert.ok(restored.orbit.periapsis>74000);assert.deepEqual([...restored.fuel],fuel);
 }finally{f.dispose();restored?.dispose();}
});

test('exhausted final stage stops the pilot without inventing endless stages or claiming orbit',()=>{
 const world=launchWorld(worldFromFlight(null),{parts:preset('atlas'),environment:'land',name:'Empty'});
 const f=loadFlight(flightFromWorld(world)),pilot=new LaunchPilot();
 try{f.stageNext();f.stageNext();for(const id of f.fuel.keys())f.fuel.set(id,0);
  for(let i=0;i<100;i++)pilot.update(f);
  assert.equal(pilot.done,true);assert.equal(pilot.phase,'燃料切れ');assert.equal(f.throttle,0);assert.equal(f.stage,1);assert.match(pilot.completionMessage,/未達/);
 }finally{f.dispose();}
});
