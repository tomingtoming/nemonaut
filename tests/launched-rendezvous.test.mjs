import test from 'node:test';import assert from 'node:assert/strict';
import {preset} from '../dist/catalog.js';import {LaunchPilot} from '../dist/launch-pilot.js';
import {WorldRuntime} from '../dist/world-runtime.js';import {launchWorld} from '../dist/world-operations.js';
import {worldFromFlight,flightFromWorld} from '../dist/world-save.js';import {saveFlight,loadFlight} from '../dist/flight-save.js';
import {relativeState,centerOfVessel} from '../dist/relative-navigation.js';import {bodyOrbitState} from '../dist/celestial.js';
import {timedRendezvousTransfer} from '../dist/timed-rendezvous.js';import {rendezvousTransfer} from '../dist/rendezvous-transfer.js';
import {maneuverPreview} from '../dist/maneuver.js';import {keplerDrift} from '../dist/coast-orbit.js';

test('two actual surface launches preserve the first vessel and produce a safe automatic transfer',()=>{
 let world=worldFromFlight(null),firstId,firstFuel,firstTime;
 for(let n=0;n<2;n++){
  world=launchWorld(world,{parts:preset('tug-launcher'),environment:'land',name:'Tug '+(n+1)});
  const f=loadFlight(flightFromWorld(world)),runtime=new WorldRuntime(f),pilot=new LaunchPilot();
  try{
   for(let i=0;i<600*120&&!pilot.done&&!f.crashed;i++){pilot.update(f);runtime.replace(f);runtime.step(1/120);}
   assert.equal(pilot.phase,'周回達成');assert.equal(f.crashed,false);assert.equal(f.stage,1);assert.ok(f.orbit.periapsis>75000);
   if(!n){firstId=f.vesselId;firstFuel=[...f.fuel];firstTime=f.universalTime;}
   else{
    const target=runtime.vessels.get(firstId);assert.ok(target);assert.notEqual(target.vesselId,f.vesselId);
    assert.equal(target.universalTime,f.universalTime);assert.ok(target.universalTime>firstTime+290);assert.deepEqual([...target.fuel],firstFuel);
    assert.ok(target.orbit.periapsis>74000);assert.ok(relativeState(f,target).distance>500000);
    const own=bodyOrbitState(centerOfVessel(f),f.vel,f.universalTime),other=bodyOrbitState(centerOfVessel(target),target.vel,target.universalTime);
    assert.throws(()=>rendezvousTransfer(own,other,{duration:600}));
    const plan=timedRendezvousTransfer(f,other,{duration:'auto'});assert.equal(plan.automatic,true);assert.ok(plan.duration>3000&&plan.duration<4000);
    assert.ok(plan.deltaV+plan.arrivalSpeed<800);assert.ok(plan.burn.duration<20);
    const impulse=rendezvousTransfer(own,other,{duration:plan.duration}),preview=maneuverPreview(centerOfVessel(f),f.vel,{universalTime:impulse.epoch},impulse.components,f.universalTime);
    assert.ok(preview.orbit.stable);
    const arrival=keplerDrift(preview.orbit.r,preview.orbit.relativeVelocity,own.body.mu,impulse.duration),destination=keplerDrift(other.r,other.relativeVelocity,own.body.mu,impulse.arrivalTime-other.universalTime);
    assert.ok(Math.abs(arrival.position.distanceTo(destination.position)-100)<.05);
   }
   world=worldFromFlight(saveFlight(f),{history:world.history});
  }finally{f.dispose();}
 }
 assert.equal(world.history.filter(e=>e.type==='launch').length,2);
});
