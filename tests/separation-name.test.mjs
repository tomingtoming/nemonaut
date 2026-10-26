import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {saveFlight,loadFlight} from '../dist/flight-save.js';
import {selectVessel} from '../dist/fleet.js';
import {separationName} from '../dist/separation-name.js';

test('Sequential separation names survive switching, saving and removal of earlier debris',()=>{
 let f=new Flight(preset('returner'),'orbit');f.vesselName='Pioneer';
 try{
  f.stageNext();f.stageNext();assert.equal(f.detached[0].vesselName,'Pioneer / 分離 1');
  const other=new Flight(preset('rocket'),'orbit');f.detached.push(other);
  f=selectVessel(selectVessel(f,other),f);
  const old=f;f=loadFlight(saveFlight(f));old.dispose();
  const removed=f.detached.shift();removed.dispose();
  f.stageNext();assert.equal(f.detached.at(-1).vesselName,'Pioneer / 分離 2');
 }finally{f.dispose();}
});
test('Legacy saves infer the next number from existing detached names',()=>{
 const f=new Flight(preset('returner'),'orbit');f.vesselName='Pioneer';f.stageNext();f.stageNext();
 const raw=saveFlight(f);delete raw.separationCount;for(const child of raw.detached)delete child.separationCount;
 const restored=loadFlight(raw);try{restored.stageNext();assert.equal(restored.detached.at(-1).vesselName,'Pioneer / 分離 2');}finally{f.dispose();restored.dispose();}
});
test('Long names retain the suffix, unnamed craft preserve legacy metadata fallback, invalid counters reject',()=>{
 assert.equal(separationName('a'.repeat(80),12).length,80);assert.ok(separationName('a'.repeat(80),12).endsWith(' / 分離 12'));
 assert.equal(separationName('',1),'');
 const f=new Flight(preset('rocket'),'orbit');try{for(const value of [-1,.5,Infinity,'1']){const raw=saveFlight(f);raw.separationCount=value;assert.throws(()=>loadFlight(raw));}}finally{f.dispose();}
});
