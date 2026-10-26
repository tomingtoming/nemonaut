import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {part} from '../dist/catalog.js';
import {loadFlight,saveFlight} from '../dist/flight-save.js';
import {worldFromFlight,flightFromWorld,validateWorld} from '../dist/world-save.js';
import {launchWorld,retireWorldVessel} from '../dist/world-operations.js';
import {surfaceOrientation,surfaceVelocity,surfaceAngularVelocity,PRIMARY_ROTATION_PERIOD} from '../dist/surface-frame.js';
import {PRIMARY} from '../dist/celestial.js';
import {DELIVERY_SITE,DELIVERY_SITES,deliverySitePosition} from '../dist/delivery-sites.js';
import {recordDeliveryAchievements} from '../dist/surface-delivery.js';
import {recordSurveyAchievement,surveyProgress} from '../dist/surface-survey.js';
import {advanceCoastFleet,isParked} from '../dist/coast-flight.js';
import {powerTotals} from '../dist/power.js';
function station(battery=true){
 const probe=part('probe'),parts=[probe,part('solar',[0,.6,0],[-Math.PI/2,0,0],probe.id)];if(battery)parts.push(part('battery',[0,.35,0],[0,0,0],probe.id));
 const world=launchWorld(worldFromFlight(null),{parts,name:'Survey station',environment:'land'}),f=loadFlight(flightFromWorld(world));
 f.sas=false;f.reactionEnabled=false;f.q.copy(surfaceOrientation(0)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),-DELIVERY_SITE.north/PRIMARY.radius));
 f.pos.copy(deliverySitePosition(0)).add(new T.Vector3(0,.205,0).applyQuaternion(f.q));f.vel.copy(surfaceVelocity(f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),0));f.omega.copy(surfaceAngularVelocity());
 for(let i=0;i<600;i++)f.step(1/120);assert.ok(isParked(f));const history=recordDeliveryAchievements(world.history,f);assert.equal(history.at(-1).type,'delivery');return {f,history,id:f.parts[0].id};
}
test('A powered battery station records day/night observation through a real rotating surface day',()=>{
 const {f,history,id}=station();try{
  f.observations.get(id).enabled=true;let remaining=PRIMARY_ROTATION_PERIOD,minimum=1200;
  while(remaining>1e-6){const r=advanceCoastFleet(f,Math.min(300,remaining));assert.equal(r.reason,null);assert.ok(r.advanced>0);remaining-=r.advanced;minimum=Math.min(minimum,powerTotals(f.parts,f.charge).stored);}
  const data=f.observations.get(id);assert.ok(data.day>=9000&&data.night>=9000,JSON.stringify(data));assert.ok(minimum>0);assert.ok(Math.abs(data.day+data.night-PRIMARY_ROTATION_PERIOD)<.01);
  const completed=recordSurveyAchievement(history,f);assert.equal(completed.at(-1).type,'survey');assert.equal(recordSurveyAchievement(completed,f),completed);
  const saved=worldFromFlight(saveFlight(f),{history:completed}),restored=validateWorld(JSON.parse(JSON.stringify(saved)));assert.equal(surveyProgress(restored.history,restored.vessels).completed.type,'survey');
  const recovered=retireWorldVessel(restored,restored.activeVesselId,'recover').world;assert.equal(recovered.vessels.length,0);assert.equal(surveyProgress(recovered.history,[]).completed.type,'survey');
  for(const mutate of [e=>e.day=8999,e=>e.night=NaN,e=>e.deliveryEventId='missing',e=>e.probePartId='wrong',e=>e.siteId='wrong']){const bad=structuredClone(saved);mutate(bad.history.at(-1));assert.throws(()=>validateWorld(bad));}
  const duplicate=structuredClone(saved);duplicate.history.push({...duplicate.history.at(-1),id:'duplicate'});assert.throws(()=>validateWorld(duplicate));
 }finally{f.dispose();}
});
test('Insufficient storage cannot earn full night coverage in one day',()=>{
 const {f,history,id}=station(false);try{
  f.observations.get(id).enabled=true;let remaining=PRIMARY_ROTATION_PERIOD;
  while(remaining>1e-6){const r=advanceCoastFleet(f,Math.min(300,remaining));assert.equal(r.reason,null);remaining-=r.advanced;}
  assert.ok(f.observations.get(id).night<9000);assert.equal(recordSurveyAchievement(history,f),history);
 }finally{f.dispose();}
});
test('Practice, unrelated probes and missing installation cannot earn the survey; data is never summed across probes',()=>{
 const {f,history,id}=station();try{
  f.observations.set(id,{enabled:false,day:9000,night:9000});assert.equal(recordSurveyAchievement(history,f,{practice:true}),history);
  const noDelivery=history.slice(0,1);assert.equal(recordSurveyAchievement(noDelivery,f),noDelivery);
  f.observations.set(id,{enabled:false,day:9000,night:0});f.observations.set('another',{enabled:false,day:0,night:9000});assert.equal(recordSurveyAchievement(history,f),history);
  f.observations.delete('another');f.observations.get(id).night=9000;f.crashed=true;assert.equal(recordSurveyAchievement(history,f),history);
 }finally{f.dispose();}
});

test('Northern data never completes an eastern survey, and per-site saved counters are strict',()=>{
 const {f,history,id}=station();try{
  const east=DELIVERY_SITES.find(s=>s.id==='east-station'),records=structuredClone(history);records.at(-1).siteId=east.id;
  f.observations.set(id,{enabled:true,day:9000,night:9000});
  assert.equal(recordSurveyAchievement(records,f),records);assert.equal(surveyProgress(records,[f],east).day,0);
  f.observations.get(id).sites={[east.id]:{day:123,night:456}};
  const saved=saveFlight(f),loaded=loadFlight(saved);try{assert.deepEqual(loaded.observations.get(id).sites,{[east.id]:{day:123,night:456}});loaded.observations.get(id).sites[east.id].day=1;assert.equal(f.observations.get(id).sites[east.id].day,123);}finally{loaded.dispose();}
  for(const sites of [[],{'north-station':{day:1,night:2}},{unknown:{day:1,night:2}},{'east-station':{day:-1,night:2}},{'east-station':{day:1,night:NaN}}]){const bad=structuredClone(saved);bad.observations[0][1].sites=sites;assert.throws(()=>loadFlight(bad));}
 }finally{f.dispose();}
});
