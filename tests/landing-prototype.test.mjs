import test from 'node:test';
import assert from 'node:assert/strict';
import {runLandingProfile} from '../tools/landing-profile.mjs';
import {RUNWAY} from '../dist/runway-navigation.js';
test('twin approach captures a 200m offset and stops on pavement',()=>{
 const r=runLandingProfile({kind:'plane-large',offset:200});
 assert.equal(r.result,'stopped');assert.equal(r.crashed,false);assert.equal(r.landed,true);
 assert.ok(r.touch.impact>-3);assert.ok(r.track.minAlong>=0&&r.track.maxAlong<RUNWAY.length);assert.ok(r.track.maxCross<RUNWAY.width/2);assert.ok(r.final.speed<.5);
});
test('centered cargo landing and the retained-integral counterexample remain distinct outcomes',()=>{
 const center=runLandingProfile({kind:'transport-cargo',offset:0});
 assert.equal(center.result,'stopped');assert.equal(center.landed,true);assert.equal(center.crashed,false);assert.ok(center.track.maxCross<RUNWAY.width/2);
 const offset=runLandingProfile({kind:'transport-cargo',offset:200,rollIntegral:true,lateralMode:'heading',rollGain:4});
 assert.equal(offset.result,'go-around');assert.equal(offset.touch,null);assert.equal(offset.crashed,false);assert.ok(offset.final.agl>300);assert.ok(offset.final.vs>0);
});
for(const kind of ['plane','plane-large','transport-cargo'])for(const fuelLoad of [.25,.5,1])for(const sign of [-1,1])test(`${kind} fuel ${fuelLoad} captures ${sign*200}m and ${sign*10}deg before stopping inside the runway`,()=>{
 const r=runLandingProfile({kind,fuelLoad,offset:sign*200,headingOffset:sign*10});
 assert.equal(r.result,'stopped');assert.equal(r.crashed,false);assert.equal(r.landed,true);
 assert.ok(r.touch.impact>-3);assert.ok(r.track.minAlong>=0&&r.track.maxAlong<RUNWAY.length);
 assert.ok(r.track.maxCross<RUNWAY.width/2);assert.ok(r.final.speed<.5);
 assert.ok(Math.abs(r.final.heading-90)<5,'rollout must not spin the aircraft');
});
for(const kind of ['plane','plane-large'])test(`${kind} full-fuel lateral counterexample is isolated from speed and flare`,()=>{
 const options={kind,offset:200,headingOffset:10,fuelLoad:1};
 const baseline=runLandingProfile({...options,lateralMode:'heading',rollGain:4});
 assert.equal(baseline.result,'go-around');assert.deepEqual(baseline.abort.reasons,['wheel-clearance']);
 assert.equal(baseline.touch,null);assert.equal(baseline.crashed,false);
 const candidate=runLandingProfile({...options,lateralMode:'acceleration',rollGain:4});
 assert.equal(candidate.result,'stopped');assert.equal(candidate.landed,true);assert.equal(candidate.crashed,false);
 assert.ok(candidate.track.minAlong>=0&&candidate.track.maxAlong<RUNWAY.length);
 assert.ok(candidate.track.maxCross<RUNWAY.width/2);assert.ok(candidate.touch.impact>-3);
 assert.ok(Math.abs(candidate.final.heading-90)<5);
});
test('slow roll response makes acceleration guidance miss cargo final: preserve the counterexample',()=>{
 const r=runLandingProfile({kind:'transport-cargo',offset:200,headingOffset:10,lateralMode:'acceleration',rollGain:4});
 assert.equal(r.result,'go-around');assert.deepEqual(r.abort.reasons,['wheel-clearance']);
 assert.equal(r.touch,null);assert.equal(r.crashed,false);assert.ok(r.final.vs>0);
});
