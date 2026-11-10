import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
// The engine built with `--features diagnostics` (see .github/workflows/rust-kernel.yml); the game's Wasm lacks these exports.
const bytes=await readFile(process.env.ENGINE_DIAGNOSTICS_WASM||new URL('../../engine/target/orbital_engine_diagnostics.wasm',import.meta.url));
const fresh=async()=>(await WebAssembly.instantiate(bytes,{})).instance.exports;
const state=a=>Array.from({length:14},(_,i)=>a.kernel_read(i));
const save=a=>Array.from({length:a.kernel_save()},(_,i)=>a.kernel_save_read(i));
function load(a,data){a.kernel_load_begin();for(const value of data)assert.equal(a.kernel_load_push(value),1);return a.kernel_load_commit();}
function compare(a,b,tolerance){const av=state(a),bv=state(b);for(let i=0;i<14;i++)assert.ok(Number.isFinite(av[i])&&Math.abs(av[i]-bv[i])<=(i===13?0:tolerance),JSON.stringify({i,a:av[i],b:bv[i],tolerance}));}
for(const ground of [0,1]){
 const control=await fresh(),shifted=await fresh();
 assert.equal(control.kernel_reset(5,ground),1);assert.equal(shifted.kernel_reset(5,ground),1);
 let restored;
 for(let tick=0;tick<360;tick++){
  if(tick===60||tick===180){
   const d=tick===60?[100,-20,50]:[-100,20,-50];
   const before=state(shifted);assert.equal(shifted.kernel_shift(...d),ground?0:1);
   const after=state(shifted);for(let i=0;i<14;i++)assert.ok(Math.abs(after[i]-before[i])<=(i<3?.00001:0));
   if(restored)assert.equal(restored.kernel_shift(...d),ground?0:1);
  }
  const command=[ground?0:2,0,0,0,ground?0:.1,0,1,ground?-9.81:0];
  assert.equal(control.kernel_step(...command),1);assert.equal(shifted.kernel_step(...command),1);
  compare(control,shifted,.001);
  if(restored){assert.equal(restored.kernel_step(...command),1);compare(restored,shifted,0);}
  if(tick===120){
   const data=JSON.parse(JSON.stringify(save(shifted)));
   restored=await fresh();assert.equal(load(restored,data),1);compare(restored,shifted,0);
   const before=state(restored);
   const badVersion=data.slice();badVersion[0]=99;
   const lateBadCommand=data.slice();lateBadCommand[lateBadCommand.length-9]=9;
   for(const invalid of [[],data.slice(0,-1),badVersion,lateBadCommand,[1,NaN,0,0]]){
    assert.equal(load(restored,invalid),0);assert.deepEqual(state(restored),before);
   }
   assert.equal(restored.kernel_shift(NaN,0,0),0);assert.deepEqual(state(restored),before);
  }
 }
 console.log(JSON.stringify({case:ground?'contact-save-rebase-rejected':'rotating-flight-rebase-save',ticks:360,shiftTolerance:.001,restoreDifference:0,pass:true}));
 for(const a of [control,shifted,restored])a.kernel_dispose();
}
console.log('Replay save transfer, continued contact state, world-coordinate invariance and failed-load rollback: pass');
