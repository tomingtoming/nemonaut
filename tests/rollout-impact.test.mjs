import test from 'node:test';
import assert from 'node:assert/strict';
import {rolloutImpact} from '../tools/rollout-impact-profile.mjs';
import {RUNWAY} from '../dist/runway-navigation.js';
for(const kind of ['plane','plane-large','transport-cargo'])test(`${kind} delayed braking and pitch damping reduce post-touchdown impact`,()=>{
 const baseline=rolloutImpact({kind}),candidate=rolloutImpact({kind,mode:'both'});
 assert.equal(candidate.result,'stopped');assert.equal(baseline.result,'stopped');
 assert.equal(candidate.crashed,false);assert.equal(candidate.initialParts,candidate.remainingParts);
 assert.deepEqual(candidate.touchdown,baseline.touchdown,'approach must remain the same');
 assert.ok(candidate.worst.impact>baseline.worst.impact);
 assert.ok(candidate.worst.impact>-3,JSON.stringify(candidate.worst));
 assert.ok(candidate.track.maxAlong<baseline.track.maxAlong+100);
 assert.ok(candidate.track.maxAlong<RUNWAY.length&&candidate.track.minAlong>=0&&candidate.track.maxCross<RUNWAY.width/2);
});
for(const kind of ['plane','plane-large','transport-cargo'])test(`${kind} candidate also stops after offset and lighter approaches`,()=>{
 for(const condition of [{offset:200,fuelLoad:.5},{offset:-200,fuelLoad:.35}]){
  const r=rolloutImpact({kind,mode:'both',...condition});
  assert.equal(r.result,'stopped',JSON.stringify(r));assert.equal(r.crashed,false);
  assert.ok(r.worst.impact>-3,JSON.stringify(r.worst));
  assert.ok(r.track.minAlong>=0&&r.track.maxAlong<RUNWAY.length&&r.track.maxCross<RUNWAY.width/2);
 }
});
