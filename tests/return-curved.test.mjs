import test from 'node:test';
import assert from 'node:assert/strict';
import {runReturnFlight} from '../tools/return-flight-profile.mjs';
import {RUNWAY} from '../dist/runway-navigation.js';
for(const kind of ['plane','plane-large','transport-cargo'])for(const outboundHeading of [null,210])test(`${kind} calculated return after outbound ${outboundHeading??'runway heading'}`,()=>{
 const r=runReturnFlight({kind,curved:true,outboundHeading,returnAfter:outboundHeading===null?0:200,seconds:1100});
 assert.equal(r.result,'stopped',JSON.stringify(r));
 assert.equal(r.crashed,false);assert.equal(r.landed,true);assert.equal(r.unexpectedContact,null);
 assert.equal(r.ownerUnchanged,true);assert.equal(r.remainingParts,r.initialParts);
 const start=r.events.find(e=>e.phase==='return:0');
 assert.ok(start);
 if(outboundHeading!==null){assert.ok(start.time>=200);assert.ok(Math.abs(start.heading-outboundHeading)<20);assert.ok(Math.abs(start.x)>1000);}
 assert.ok(r.remainingFuel>0&&r.remainingFuel<r.initialFuel);
 assert.ok(r.route.length>18000&&r.route.radius>=2500);
 assert.ok(r.route.maxRouteError<1000,JSON.stringify(r.route));
 assert.ok(r.handoff.remaining>5000&&r.handoff.remaining<10000);
 assert.ok(Math.abs(r.handoff.cross)<200&&Math.abs(r.handoff.heading-90)<10);
 assert.ok(r.handoff.height>300&&r.handoff.height<400);
 for(const track of [r.departureTrack,r.landingTrack]){
  assert.ok(track.minAlong>=0&&track.maxAlong<RUNWAY.length);
  assert.ok(track.maxCross<RUNWAY.width/2);
 }
 assert.ok(r.landingTouch.impact>-3);assert.ok(r.final.speed<.5);
});
