import test from 'node:test';
import assert from 'node:assert/strict';
import {runReturnFlight} from '../tools/return-flight-profile.mjs';
import {RUNWAY} from '../dist/runway-navigation.js';
for(const kind of ['plane','plane-large','transport-cargo'])test(`${kind} departs, returns and lands as the same physical aircraft`,()=>{
 const r=runReturnFlight({kind,seconds:900});
 assert.equal(r.result,'stopped');assert.equal(r.crashed,false);assert.equal(r.landed,true);
 assert.equal(r.ownerUnchanged,true);assert.equal(r.everAirborne,true);assert.equal(r.unexpectedContact,null);
 assert.equal(r.remainingParts,r.initialParts);assert.ok(r.remainingFuel>0&&r.remainingFuel<r.initialFuel);
 for(const track of [r.departureTrack,r.landingTrack]){
  assert.ok(track&&track.minAlong>=0&&track.maxAlong<RUNWAY.length);
  assert.ok(track.maxCross<RUNWAY.width/2);
 }
 assert.ok(r.handoff.time>100&&r.landingTouch.time>r.handoff.time);
 assert.ok(r.landingTouch.impact>-3);assert.ok(r.final.speed<.5);
 assert.ok(Math.abs(r.final.heading-90)<5);
 const phases=r.events.map(e=>e.phase);
 for(const phase of ['departure:roll','departure:climb','return:0','return:1','return:2','return:3','landing:approach','landing:rollout','landing:stopped'])assert.ok(phases.includes(phase),phase);
});
