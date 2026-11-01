// In-process timing of Golden v1 replay on the JS solver vs Rust physics (alternating rounds,
// warm, excludes process start and Wasm compile). Usage: node tools/golden/bench.mjs [rounds]
import {readFile} from 'node:fs/promises';
import R from '../../dist/vendor/rapier/rapier.mjs';
import {installRustEngine} from '../../dist/rust-engine.js';
import {replay} from './replay-js.mjs';
const module=await WebAssembly.compile(await readFile(new URL('../../dist/engine/orbital_engine.wasm',import.meta.url)));
const v1=JSON.parse((await readFile(new URL('../../tests/golden/js-v1.json',import.meta.url),'utf8')).replace(/^﻿/,''));
const run=()=>{const t=performance.now();for(const {definition} of v1.cases)replay(definition);return performance.now()-t;};
const rounds=Number(process.argv[2]??5),js=[],rust=[];run();
for(let i=0;i<rounds;i++){js.push(run());const e=installRustEngine(R,module);rust.push(run());e.uninstall();}
const median=a=>[...a].sort((x,y)=>x-y)[a.length>>1];
console.log(JSON.stringify({rounds,jsMs:+median(js).toFixed(1),rustMs:+median(rust).toFixed(1),ratio:+(median(rust)/median(js)).toFixed(3),js:js.map(Math.round),rust:rust.map(Math.round)}));
