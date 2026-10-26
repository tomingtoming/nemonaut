import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {part} from '../dist/catalog.js';import {loadFlight,saveFlight} from '../dist/flight-save.js';
import {launchWorld} from '../dist/world-operations.js';import {worldFromFlight,flightFromWorld,validateWorld} from '../dist/world-save.js';
import {surfaceVelocity,surfaceOrientation} from '../dist/surface-frame.js';import {PRIMARY} from '../dist/celestial.js';
import {DELIVERY_SITE,deliverySitePosition} from '../dist/delivery-sites.js';
import {recordFlightChallenges,precisionLandingStatus} from '../dist/precision-landing.js';
function fixture(){const probe=part('probe'),world=launchWorld(worldFromFlight(null),{parts:[probe],name:'Hopper',environment:'land'}),f=loadFlight(flightFromWorld(world));let history=world.history;
 function position(height=0,offset=0){f.time++;f.universalTime++;f.q.copy(surfaceOrientation(f.universalTime)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),-DELIVERY_SITE.north/PRIMARY.radius));const up=new T.Vector3(0,1,0).applyQuaternion(f.q);f.pos.copy(deliverySitePosition(f.universalTime)).addScaledVector(up,.2+height);f.pos.x+=offset;f.vel.copy(surfaceVelocity(f.pos,f.universalTime));f.orbit={bodyId:'planet',altitude:height+.2};f.telemetry.groundContact=height===0;f.landed=height===0;}
 function record(options){history=recordFlightChallenges(history,f,options);return history;}
 return {f,position,record,get history(){return history;},set history(h){history=h;}};
}
test('Altitude, first contact and stop form a persistent precision landing, independently of vessel names',()=>{const s=fixture();try{
 s.position(0);assert.equal(s.record().length,1);s.position(99);assert.equal(s.record().length,1);
 s.position(101);assert.equal(s.record().at(-1).type,'flight-ascent');const h=s.history;assert.equal(s.record(),h);
 s.position(0);s.f.landed=false;s.f.vel.x+=3;assert.equal(s.record().at(-1).type,'flight-touchdown');assert.equal(s.record().length,3);
 const saved=validateWorld(JSON.parse(JSON.stringify(worldFromFlight(saveFlight(s.f),{history:s.history}))));assert.deepEqual(saved.history,s.history);
 s.f.vesselName='Renamed';s.position(0);assert.equal(s.record().at(-1).type,'precision-landing');assert.match(precisionLandingStatus(null,s.history,DELIVERY_SITE),/Renamed/);assert.equal(s.record().length,4);
 validateWorld(worldFromFlight(saveFlight(s.f),{history:s.history}));
 }finally{s.f.dispose();}});
test('Rolling from an outside touchdown into the circle is rejected; a new 100m flight can retry',()=>{const s=fixture();try{
 s.position(101);s.record();s.position(0,80);s.record();s.position(0);assert.equal(s.record().length,3);assert.match(precisionLandingStatus(s.f,s.history,DELIVERY_SITE),/円外/);
 s.position(101);assert.equal(s.record().at(-1).type,'flight-ascent');s.position(0);s.record();assert.equal(s.record().at(-1).type,'precision-landing');
 }finally{s.f.dispose();}});
test('Practice, absent provenance, damage, flyby and excessive stop speed earn no precision award',()=>{
 for(const kind of ['practice','origin','damage','flyby','speed']){const s=fixture();try{s.position(101);if(kind==='origin')s.history=[];s.record({practice:kind==='practice'});s.position(0);if(kind==='flyby')s.f.telemetry.groundContact=false;s.record({practice:kind==='practice'});if(kind==='damage')s.f.crashed=true;if(kind==='speed')s.f.vel.x+=1;s.record({practice:kind==='practice'});assert.ok(!s.history.some(e=>e.type==='precision-landing'),kind);}finally{s.f.dispose();}}
});
test('Fabricated, duplicated and mismatched flight evidence is rejected on load',()=>{const s=fixture();try{
 s.position(101);s.record();s.position(0);s.record();s.record();const saved=worldFromFlight(saveFlight(s.f),{history:s.history});
 for(const change of [h=>h[1].clearance=99,h=>h[1].launchEventIds=[],h=>h[2].flightEventIds=[],h=>h[2].distance=80,h=>h[2].damaged=true,h=>h[3].speed=.5,h=>h[3].siteId='east-station',h=>h[3].flightEventIds=[h[1].id],h=>h.push({...h[3],id:'duplicate'})]){const bad=structuredClone(saved);change(bad.history);assert.throws(()=>validateWorld(bad));}
 }finally{s.f.dispose();}});
import {preset} from '../dist/catalog.js';
test('Real powered hop captures contact before the landed/stop flag and survives a midair save',()=>{
 const world=launchWorld(worldFromFlight(null),{parts:preset('returner'),name:'Physical hop',environment:'land'});let f=loadFlight(flightFromWorld(world)),history=world.history,separated=false,restored=false,contactBeforeStop=false;
 try{f.stageNext();f.throttle=1;
 for(let i=0;i<120*240&&!f.crashed;i++){
  if(!separated&&f.orbit?.altitude>180){f.throttle=0;while(f.parts.length>3)f.stageNext();f.armParachutes();separated=true;}
  f.step(1/120);history=recordFlightChallenges(history,f);
  if(!restored&&history.some(e=>e.type==='flight-ascent')){const saved=validateWorld(worldFromFlight(saveFlight(f),{history}));f.dispose();f=loadFlight(flightFromWorld(saved));history=saved.history;restored=true;}
  if(history.some(e=>e.type==='flight-touchdown'&&e.vesselId===f.vesselId)&&!f.landed)contactBeforeStop=true;
  if(separated&&f.landed)break;
 }
 assert.ok(restored);assert.ok(f.landed);assert.equal(f.crashed,false);assert.ok(contactBeforeStop);assert.ok(history.some(e=>e.type==='flight-touchdown'));assert.ok(!history.some(e=>e.type==='precision-landing'),'vertical hop at pad misses northern target');
 validateWorld(worldFromFlight(saveFlight(f),{history}));
 }finally{f.dispose();}
});
