// node --import ./tools/golden/rust-preload.mjs --test tests/*.test.mjs
// The game runs on the Rust engine through dist/physics.js, which loads it by itself; this preload
// only adds diagnostics. With RUST_PRELOAD_LOG=<dir>, each process records how many steps ran.
// RUST_PRELOAD_NEGATIVE=zero-impulses reads every ground contact impulse as 0 (negative control).
import {mkdir} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import P,{loadPhysics} from '../../dist/physics.js';
await loadPhysics();
const stats={worlds:0,frames:0};
const {step,contactPair}=P.World.prototype;
P.World.prototype.step=function(){stats.frames++;return step.call(this);};
if(process.env.RUST_PRELOAD_NEGATIVE==='zero-impulses')P.World.prototype.contactPair=function(a,b,callback){return contactPair.call(this,a,b,m=>callback({numContacts:()=>m.numContacts(),contactImpulse:()=>0},false));};
const dir=process.env.RUST_PRELOAD_LOG;
if(dir){await mkdir(dir,{recursive:true});process.on('exit',()=>writeFileSync(`${dir}/${process.pid}.json`,JSON.stringify({argv:process.argv.slice(1),...stats})));}
