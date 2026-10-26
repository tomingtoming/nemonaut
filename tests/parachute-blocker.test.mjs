import test from 'node:test';
import assert from 'node:assert/strict';
import {parachuteBlocker,parachuteStep,parachuteWaitReason} from '../dist/recovery.js';
test('Parachute wait reason and actual deployment use the same strict safety boundaries',()=>{
 const safe={altitude:4000,speed:200,vertical:-10,density:1};
 for(const [change,reason] of [[{density:.03},'大気不足'],[{altitude:5000},'高度5 km以上'],[{vertical:0},'降下待ち'],[{speed:250},'速度250 m/s以上'],[{density:2},'動圧過大']]){
  const env={...safe,...change},s={status:'armed',fraction:0};assert.equal(parachuteBlocker(env),reason);parachuteStep(s,env,1);assert.equal(s.status,'armed');assert.equal(parachuteWaitReason(s),reason);
  parachuteStep(s,safe,1);assert.equal(s.status,'reefed');assert.equal(parachuteWaitReason(s),'');
 }
});
