import test from 'node:test';import assert from 'node:assert/strict';
import {Flight,statistics,validateCraft} from '../dist/core.js';import {preset,PARTS} from '../dist/catalog.js';
import {setPartAction} from '../dist/part-actions.js';import {stagePerformance,engineBurn} from '../dist/resources.js';
import {stageFuelLevels} from '../dist/stage-fuel.js';import {saveFlight,loadFlight} from '../dist/flight-save.js';import {editSymmetrySetting} from '../dist/symmetry.js';
test('Reserved tanks keep their mass and fuel while engines draw from remaining stores; release restores supply',()=>{
 const f=new Flight(preset('launcher'),'orbit');try{const g=f.networks.groups.find(g=>g.tanks.length>1),a=g.tanks[0],before=statistics(f.parts,f.fuel),baseline=stagePerformance(f.parts,f.fuel).reduce((s,p)=>s+p.dv,0);assert.ok(setPartAction(f,a.id,'fuelEnabled',false));const plan=stagePerformance(f.parts,f.fuel);assert.ok(plan.reduce((s,p)=>s+p.dv,0)<baseline);assert.equal(statistics(f.parts,f.fuel).mass,before.mass);assert.equal(stageFuelLevels(f.parts,f.fuel).get(g.engines[0].stage).capacity,(g.tanks.length-1)*1800);
 const burns=engineBurn(f.networks,f.fuel,new Set(g.engines.map(p=>p.id)),1,0,10);assert.ok([...burns.values()].some(v=>v>0));assert.equal(f.fuel.get(a.id),1800);assert.ok(f.fuel.get(g.tanks[1].id)<1800);
 for(const p of g.tanks)setPartAction(f,p.id,'fuelEnabled',false);assert.ok([...engineBurn(f.networks,f.fuel,new Set(g.engines.map(p=>p.id)),1,0,1).values()].every(v=>v===0));assert.equal(stageFuelLevels(f.parts,f.fuel).get(g.engines[0].stage).capacity,0);assert.equal(f.fuel.get(a.id),1800);
 setPartAction(f,a.id,'fuelEnabled',true);assert.ok(engineBurn(f.networks,f.fuel,new Set(g.engines.map(p=>p.id)),1,0,1).get(g.engines[0].id)>0);assert.ok(f.fuel.get(a.id)<1800);
 }finally{f.dispose();}
});
test('RCS reserves prevent real nozzle consumption, persist, and permit explicit manual refueling',()=>{
 const f=new Flight(preset('docking'),'orbit');try{f.rcsEnabled=true;f.sas=false;const blocks=f.parts.filter(p=>PARTS[p.type].monoprop);for(const p of blocks)setPartAction(f,p.id,'fuelEnabled',false);for(let i=0;i<60;i++)f.step(1/120,{translateX:1});assert.ok(blocks.every(p=>f.fuel.get(p.id)===12));assert.ok(!f.rcsJets.some(j=>j.level>0));
 f.fuel.set(blocks[1].id,0);assert.equal(f.transferFuel(blocks[0].id,blocks[1].id,2),2,'explicit transfer remains available');const saved=loadFlight(saveFlight(f));try{assert.ok(saved.parts.filter(p=>PARTS[p.type].monoprop).every(p=>p.fuelEnabled===false));}finally{saved.dispose();}
 setPartAction(f,blocks[0].id,'fuelEnabled',true);for(let i=0;i<60;i++)f.step(1/120,{translateX:1});assert.ok(f.fuel.get(blocks[0].id)<10);assert.equal(f.fuel.get(blocks[1].id),2);
 }finally{f.dispose();}
});
test('Reserve settings can be saved with a design, and unavailable equipment rejects them',()=>{const parts=preset('plane'),tank=parts.find(p=>p.type==='tank'),engine=parts.find(p=>p.type==='jet'),edited=editSymmetrySetting(parts,tank.id,'fuelEnabled',false);assert.equal(validateCraft({version:1,parts:edited}).find(p=>p.id===tank.id).fuelEnabled,false);assert.throws(()=>editSymmetrySetting(parts,engine.id,'fuelEnabled',false));engine.fuelEnabled=false;assert.throws(()=>validateCraft({version:1,parts}));});
