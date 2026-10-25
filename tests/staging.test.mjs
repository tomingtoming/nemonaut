import test from 'node:test';
import assert from 'node:assert/strict';
import {preset} from '../dist/catalog.js';
import {Flight,validateCraft} from '../dist/core.js';
import {stagePlan,moveStage} from '../dist/staging.js';
import {fuelNetworks} from '../dist/resources.js';

test('Empty stage slots represent real Space presses before ignition',()=>{
 const parts=preset('rocket');for(const p of parts)p.stage=2;
 const plan=stagePlan(parts);assert.deepEqual(plan.map(s=>s.actions.length),[0,0,1]);
 const f=new Flight(parts,'orbit');try{f.stageNext();assert.equal(f.active.size,0);f.stageNext();assert.equal(f.active.size,0);f.stageNext();assert.deepEqual([...f.active],plan[2].actions.map(a=>a.id));}finally{f.dispose();}
});

test('Whole-stage swaps preserve every other property, fuel topology and save compatibility',()=>{
 const parts=preset('launcher'),before=structuredClone(parts);
 parts[8].symmetryGroup=parts[9].symmetryGroup='engines';
 const source=structuredClone(parts),result=moveStage(parts,0,1);
 assert.deepEqual(parts,source);
 for(let i=0;i<parts.length;i++){assert.deepEqual({...result[i],stage:parts[i].stage},parts[i]);assert.equal(result[i].stage,parts[i].stage===0?1:0);}
 const networks=p=>fuelNetworks(p).groups.map(g=>({tanks:g.tanks.map(p=>p.id),engines:g.engines.map(p=>p.id)}));
 assert.deepEqual(networks(result),networks(parts));
 assert.equal(JSON.stringify(validateCraft({version:1,parts:JSON.parse(JSON.stringify(result))})),JSON.stringify(result));
 assert.deepEqual(moveStage(result,1,-1),source);assert.equal(before.length,result.length);
});

test('Moved ignition and separation match actual execution including detached engines',()=>{
 const parts=moveStage(preset('launcher'),0,1),plan=stagePlan(parts),f=new Flight(parts,'orbit');
 try{
  const fired=plan[0].actions.filter(a=>a.kind==='engine').map(a=>a.id),separators=plan[0].actions.filter(a=>a.kind==='separate');
  assert.equal(separators.length,1);f.stageNext();assert.deepEqual([...f.active],fired);assert.equal(f.detached.length,1);
  const child=f.detached[0];assert.equal(child.parts[0].id,separators[0].id);assert.equal(child.active.size,0);
  child.stageNext();assert.deepEqual([...child.active].sort(),plan[1].actions.filter(a=>a.kind==='engine').map(a=>a.id).sort());
 }finally{f.dispose();}
});

test('Parachute is armed, not forcibly deployed; root separator is explicitly ineffective',()=>{
 const parts=preset('returner'),f=new Flight(parts,'orbit');
 try{const chute=stagePlan(parts).flatMap(s=>s.actions).find(a=>a.kind==='chute');assert.ok(chute);for(let n=0;n<=chute.stage;n++)f.stageNext();assert.equal(f.chutes.get(chute.id).status,'armed');}finally{f.dispose();}
 const separator=parts.find(p=>p.type==='decoupler');separator.parent=null;
 assert.equal(stagePlan([separator])[0].actions.length,0);
 assert.equal(stagePlan([separator]).flatMap(s=>s.actions)[0].effective,false);
});

test('Stage boundaries and non-actuated designs are handled without mutation',()=>{
 assert.deepEqual(stagePlan([]),[]);const parts=preset('rocket');assert.throws(()=>moveStage(parts,0,-1));assert.throws(()=>moveStage(parts,9,1));assert.throws(()=>moveStage(parts,0,2));assert.throws(()=>moveStage(parts,5,1));
 const later=moveStage(parts,0,1);assert.equal(stagePlan(later)[0].actions.length,0);assert.equal(stagePlan(later)[1].actions.length,1);
});
