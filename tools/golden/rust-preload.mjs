// node --import ./tools/golden/rust-preload.mjs --test tests/*.test.mjs
// Runs any existing test with the product's opt-in Rust physics installed (dist/engine Wasm).
// With RUST_PRELOAD_LOG=<dir>, each process records how many Rapier steps Rust computed.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import R from '../../dist/vendor/rapier/rapier.mjs';
import {installRustEngine} from '../../dist/rust-engine.js';
await R.init();
const module=await WebAssembly.compile(await readFile(new URL('../../dist/engine/orbital_engine.wasm',import.meta.url)));
// RUST_PRELOAD_NEGATIVE=zero-impulses reads every contact impulse as 0 (negative control).
const {stats}=installRustEngine(R,module,{zeroImpulses:()=>process.env.RUST_PRELOAD_NEGATIVE==='zero-impulses'});
const dir=process.env.RUST_PRELOAD_LOG;
if(dir){await mkdir(dir,{recursive:true});process.on('exit',()=>writeFileSync(`${dir}/${process.pid}.json`,JSON.stringify({argv:process.argv.slice(1),...stats})));}
