import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {PRIMARY,MOON,bodyUp} from '../dist/celestial.js';
import {automaticNavigationFrame,updateNavigationFrame,setNavigationFrame} from '../dist/navigation-frame.js';
import {saveFlight,loadFlight} from '../dist/flight-save.js';
test('automatic frames have separate ascent/descent thresholds on both bodies',()=>{
 for(const [body,upper]of [[PRIMARY,35000],[MOON,10000]]){
  assert.equal(automaticNavigationFrame(0,body),'surface');
  assert.equal(automaticNavigationFrame(upper,body,'surface'),'orbit');
  assert.equal(automaticNavigationFrame(upper-1,body,'orbit'),'orbit');
  assert.equal(automaticNavigationFrame(upper*.8,body,'orbit'),'surface');
  assert.equal(automaticNavigationFrame(upper*.8+1,body,'surface'),'surface');
 }
});
test('ground launch prograde follows ascent, not planetary rotation',()=>{
 for(const time of [0,193310]){
  const f=new Flight(preset('launcher'),'land',time);
  try{
   assert.equal(f.navigationFrame,'surface');assert.equal(f.navigationAuto,true);
   f.sasMode='prograde';f.stageNext();f.throttle=1;
   for(let i=0;i<120*15;i++)f.step(1/120);
   const com=f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));
   assert.equal(f.crashed,false);assert.equal(f.navigationFrame,'surface');
   assert.ok(f.orbit.altitude>100,`altitude ${f.orbit.altitude}`);
   assert.ok(new T.Vector3(0,1,0).applyQuaternion(f.q).dot(bodyUp(com,f.universalTime))>.95);
  }finally{f.dispose();}
 }
});
test('manual override, auto resume, legacy migration and save/separation keep policy',()=>{
 const f=new Flight(preset('launcher'),'land');let loaded;
 try{
  f.navigationAuto=false;setNavigationFrame(f,'orbit');updateNavigationFrame(f);assert.equal(f.navigationFrame,'orbit');
  const saved=saveFlight(f);loaded=loadFlight(saved);assert.equal(loaded.navigationAuto,false);assert.equal(loaded.navigationFrame,'orbit');loaded.dispose();
  delete saved.navigationAuto;loaded=loadFlight(saved);assert.equal(loaded.navigationAuto,true);assert.equal(loaded.navigationFrame,'surface');loaded.dispose();loaded=null;
  f.navigationAuto=true;updateNavigationFrame(f,{reset:true});assert.equal(f.navigationFrame,'surface');
  f.stageNext();f.stageNext();assert.ok(f.detached.length);assert.ok(f.detached.every(v=>v.navigationAuto&&v.navigationFrame==='surface'));
  saved.navigationAuto='yes';assert.throws(()=>loadFlight(saved));
 }finally{f.dispose();loaded?.dispose();}
});
