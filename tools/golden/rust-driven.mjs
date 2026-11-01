import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import R from '../../dist/vendor/rapier/rapier.mjs';
import {installRustEngine} from '../../dist/rust-engine.js';
import {replay} from './replay-js.mjs';
import {Flight} from '../../dist/core.js';import {preset} from '../../dist/catalog.js';import {WorldRuntime} from '../../dist/world-runtime.js';
import {assertGolden,compareGolden} from './compare.mjs';
// Runs every frozen Golden through the product's opt-in Rust delegation (dist/rust-engine.js).
// The JS solver is never called while installed; game logic stays JS.
const module=await WebAssembly.compile(await readFile(new URL('../../engine/target/wasm32-unknown-unknown/release/orbital_engine.wasm',import.meta.url)));
const load=async v=>JSON.parse((await readFile(new URL(`../../tests/golden/js-v${v}.json`,import.meta.url),'utf8')).replace(/^﻿/,''));
const baselines=[await load(1),await load(2)];
let zero=false;const jsStep=R.World.prototype.step;
R.World.prototype.step=()=>{throw Error('JS solver must not run');};// proves delegation replaces every step
const engine=installRustEngine(R,module,{zeroImpulses:()=>zero});
const reset=()=>Object.assign(engine.stats,{worlds:0,frames:0,rebuilds:0,contactQueries:0,contactPoints:0});
const results=[];
try{
 for(const baseline of baselines)for(const {definition:d,expected} of baseline.cases){
  reset();const result=assertGolden(expected,replay(d),{mode:d.mode,limits:baseline.tolerances}),s=engine.stats;
  assert.ok(s.frames>=d.ticks,'every tick stepped through Rust');assert.equal(engine.worlds.size,0,'disposed worlds release Rust instances');
  const summary={golden:baseline.version,case:d.name,mode:d.mode,ticks:d.ticks,...s,maxToleranceRatio:result.maxRatio,pass:true};
  results.push(summary);console.log(JSON.stringify(summary));
 }
 assert.deepEqual(baselines.map(b=>results.filter(r=>r.golden===b.version).length),[8,2],'all frozen Golden cases');
 assert.ok(results.some(r=>r.worlds>1&&r.rebuilds>0),'staging/fracture must create and rebuild Rust worlds');
 assert.ok(results.filter(r=>r.case.endsWith('tank-impact')).every(r=>r.contactPoints>0),'ground impacts must read Rust contact impulses');
 // Negative control: v2 must detect Rust contact impulses that are read as zero.
 zero=true;
 for(const {definition:d,expected} of baselines[1].cases){reset();assert.equal(compareGolden(expected,replay(d),{mode:d.mode,limits:baselines[1].tolerances}).pass,false,'zeroed impulses must fail '+d.name);console.log(JSON.stringify({negativeControl:d.name,zeroImpulses:true,rejected:true}));}
 zero=false;
 // Product flights outlive the old 7200-tick diagnostic cap (60 s at 120 Hz).
 reset();{const f=new Flight(preset('orbiter'),'orbit');f.sas=false;const runtime=new WorldRuntime(f);try{for(let i=0;i<7300;i++)runtime.step(1/120,{});}finally{f.dispose();}}
 assert.ok(engine.stats.frames>=7300,'long flight keeps stepping in Rust');console.log(JSON.stringify({case:'orbiter-7300-ticks',frames:engine.stats.frames,pass:true}));
}finally{engine.uninstall();R.World.prototype.step=jsStep;}
