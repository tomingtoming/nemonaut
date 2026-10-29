import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {replay} from '../tools/golden/replay-js.mjs';import {compareGolden,assertGolden} from '../tools/golden/compare.mjs';
const baseline=JSON.parse(readFileSync(new URL('./golden/js-v1.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
for(const {definition,expected} of baseline.cases)test('JS golden: '+definition.name,()=>assertGolden(expected,replay(definition),{mode:definition.mode,limits:baseline.tolerances}));
test('golden rejects control/topology/fuel regressions but tolerates numeric noise and quaternion sign',()=>{
 const original=baseline.cases[0].expected,copy=()=>structuredClone(original);
 let changed=copy();changed.samples[0].vessels[0].position[0]+=.001;changed.samples[0].vessels[0].quaternion=changed.samples[0].vessels[0].quaternion.map(n=>-n);assert.equal(compareGolden(original,changed).pass,true);
 for(const mutate of [v=>v.state.controllable=!v.state.controllable,v=>v.parts.pop(),v=>v.resources[0].fuel+=1,v=>v.position[0]+=1,v=>v.velocity[0]=NaN]){changed=copy();mutate(changed.samples[0].vessels[0]);assert.equal(compareGolden(original,changed).pass,false);}
});
test('impact golden permits divergent fragment trajectories but still rejects wrong failure causes',()=>{
 const original=baseline.cases.find(c=>c.definition.name==='fuel-tank-impact').expected,changed=structuredClone(original);changed.samples.at(-1).vessels[0].position[0]+=10;
 assert.equal(compareGolden(original,changed,{mode:'impact'}).pass,true);assert.equal(compareGolden(original,changed).pass,false);
 changed.samples.at(-1).events[0].cause='thermal';assert.equal(compareGolden(original,changed,{mode:'impact'}).pass,false);
});

test('impact comparison still rejects nonfinite diagnostic trajectories',()=>{const original=baseline.cases.find(c=>c.definition.mode==='impact').expected,changed=structuredClone(original);changed.samples.at(-1).vessels[0].position[0]=NaN;assert.equal(compareGolden(original,changed,{mode:'impact'}).pass,false);});
