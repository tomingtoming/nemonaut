import test from 'node:test';import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';import {preset} from '../dist/catalog.js';
import {saveFlight,loadFlight} from '../dist/flight-save.js';import {fleet,selectVessel} from '../dist/fleet.js';
import {launchIntoFleet} from '../dist/launch-fleet.js';import {workspaceRecord,validateWorkspace} from '../dist/workspace-save.js';
import {retireVessel} from '../dist/vessel-recovery.js';import {setUniversalTime,formatUniversalTime} from '../dist/universal-time.js';
import {undockVessel,dockVessels} from '../dist/docking.js';

test('Universal time advances once for the fleet, surviving separation and control switching',()=>{
 let f=new Flight(preset('twin'),'orbit');try{setUniversalTime(f,123);f.stageNext();f.stageNext();f.step(.1);assert.ok(fleet(f).every(v=>v.universalTime===123.1));f=selectVessel(f,f.detached[0]);f.step(.1);assert.ok(fleet(f).every(v=>Math.abs(v.universalTime-123.2)<1e-10));f.crashed=true;const mission=f.time;f.step(.1);assert.equal(f.time,mission);assert.ok(fleet(f).every(v=>Math.abs(v.universalTime-123.3)<1e-10));}finally{f.dispose();}
});

test('Additional launch keeps world time but starts a fresh mission clock',()=>{
 const old=new Flight(preset('orbiter'),'orbit');let next;try{old.step(.25);setUniversalTime(old,700);const saved=saveFlight(old),before=structuredClone(saved);next=launchIntoFleet(saved,{parts:preset('rocket'),environment:'land',name:'new',universalTime:700});assert.equal(next.time,0);assert.equal(next.detached[0].time,.25);assert.ok(fleet(next).every(v=>v.universalTime===700));next.step(.1);assert.ok(fleet(next).every(v=>v.universalTime===700.1));assert.deepEqual(saved,before);assert.throws(()=>launchIntoFleet(saved,{parts:preset('rocket'),environment:'land',name:'bad',universalTime:701}));}finally{next?.dispose();old.dispose();}
});

test('Flight snapshots rewind UT together with fleet state; malformed or divergent clocks are rejected',()=>{
 const f=new Flight(preset('twin'),'orbit');let restored;try{f.stageNext();f.stageNext();setUniversalTime(f,500);const saved=saveFlight(f);f.step(.2);restored=loadFlight(saved);assert.ok(fleet(restored).every(v=>v.universalTime===500));for(const time of [-1,NaN,Infinity,1e13,'500']){const bad=structuredClone(saved);bad.universalTime=time;assert.throws(()=>loadFlight(bad));}const bad=structuredClone(saved);bad.detached[0].universalTime=501;assert.throws(()=>loadFlight(bad));}finally{restored?.dispose();f.dispose();}
});

test('Legacy saves migrate from maximum retained mission time without rewriting mission ages',()=>{
 const f=new Flight(preset('twin'),'orbit');let restored;try{f.stageNext();f.stageNext();const saved=saveFlight(f);delete saved.universalTime;delete saved.detached[0].universalTime;saved.state.time=10;saved.detached[0].state.time=90;restored=loadFlight(saved);assert.equal(restored.universalTime,90);assert.equal(restored.detached[0].universalTime,90);assert.equal(restored.time,10);assert.equal(restored.detached[0].time,90);const w={...workspaceRecord({parts:preset('plane'),name:'draft',bay:'sph',environment:'runway'}),flight:saved};delete w.universalTime;assert.equal(validateWorkspace(w).universalTime,90);}finally{restored?.dispose();f.dispose();}
});

test('Last-vessel retirement keeps time in empty workspace and next launch',()=>{
 const f=new Flight(preset('rocket'),'orbit');let next;try{setUniversalTime(f,900);const result=retireVessel(saveFlight(f),f.parts[0].id,'terminate');assert.equal(result.record,null);const w=validateWorkspace(workspaceRecord({parts:[],name:'empty',bay:'vab',environment:'land',flight:null,universalTime:900}));assert.equal(w.universalTime,900);next=launchIntoFleet(null,{parts:preset('rocket'),name:'next',environment:'land',universalTime:w.universalTime});assert.equal(next.universalTime,900);assert.equal(next.time,0);assert.equal(formatUniversalTime(900),'UT 900.0 s');}finally{next?.dispose();f.dispose();}
});

test('Docking and undocking retain the shared epoch',()=>{
 let f=new Flight(preset('docking'),'orbit');try{setUniversalTime(f,300);const port=f.parts.find(p=>p.dockPartner);const partner=port.dockPartner;f=undockVessel(f,port.id);assert.ok(fleet(f).every(v=>v.universalTime===300));f=dockVessels(f,f.detached[0],port.id,partner);assert.equal(f.universalTime,300);}finally{f.dispose();}
});
