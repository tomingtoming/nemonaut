import test from 'node:test';import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';import {preset} from '../dist/catalog.js';
import {advanceCoastFleet,coastBlocker} from '../dist/coast-flight.js';
import {saveFlight,loadFlight} from '../dist/flight-save.js';
import {pendingBurns} from '../dist/burn-schedule.js';
import {trackingList} from '../dist/tracking.js';

test('An overdue retained-vessel plan identifies its owner without mutating the fleet',()=>{
 const a=new Flight(preset('orbiter'),'orbit',100),parts=preset('orbiter').map(p=>({...p,id:'other-'+p.id,parent:p.parent?'other-'+p.parent:null})),b=new Flight(parts,'moon-orbit',100);
 let restored;
 try{
  b.vesselName='月待機機';a.detached.push(b);
  b.maneuver={universalTime:90,time:0,position:b.pos.toArray(),velocity:b.vel.toArray(),impulse:[0,1,0],remaining:[0,1,0],complete:false};
  const before=saveFlight(a),result=advanceCoastFleet(a,100);
  assert.equal(result.advanced,0);assert.equal(result.reason,'予定噴射の直前');
  assert.equal(result.blocker.vesselName,'月待機機');assert.ok(b.parts.some(p=>p.id===result.blocker.vesselId));
  assert.equal(result.blocker.overdue,true);assert.equal(result.blocker.scheduledTime,90);assert.deepEqual(saveFlight(a),before);
  restored=loadFlight(before);assert.deepEqual(coastBlocker(restored),result.blocker);
  const row=trackingList(before).find(r=>r.id===result.blocker.vesselId);assert.equal(row.pendingBurns[0].time,90);assert.equal(row.pendingBurns[0].overdue,true);
  b.maneuver.complete=true;assert.equal(coastBlocker(a),null);
  b.throttle=.2;assert.equal(coastBlocker(a).code,'thrust');assert.equal(coastBlocker(a).vesselName,'月待機機');
 }finally{restored?.dispose();a.dispose();}
});

test('Schedule and blocker choose the earliest cutoff when two burn plans coexist',()=>{
 const f=new Flight(preset('orbiter'),'transfer',100);
 try{
  f.maneuver={universalTime:180,time:80,complete:false,capture:{}};
  assert.deepEqual(pendingBurns(f).map(b=>[b.time,b.cutoff]),[[180,120],[160,145]]);
  f.universalTime=121;assert.equal(coastBlocker(f).scheduledTime,180);
  f.maneuver.universalTime=300;f.universalTime=146;
  assert.equal(coastBlocker(f).scheduledTime,160);
  f.maneuver.complete=true;assert.equal(pendingBurns(f).length,1);
  f.transferGuide.firstBurnTime=160;assert.deepEqual(pendingBurns(f),[]);
 }finally{f.dispose();}
});

test('A coast that reaches a future deadline retains the limiting vessel',()=>{
 const f=new Flight(preset('orbiter'),'transfer',100);
 try{
  f.vesselName='遷移練習機';const result=advanceCoastFleet(f,100);
  assert.equal(result.reason,'予定噴射の直前');assert.equal(result.blocker.vesselName,'遷移練習機');assert.equal(result.blocker.overdue,false);
  assert.equal(result.blocker.scheduledTime,160);assert.equal(f.universalTime,145);
 }finally{f.dispose();}
});

test('Ordinary maneuver coast stops with the same sixty-second alignment margin as physical warp',async()=>{
 const {physicalWarpStop}=await import('../dist/physics-clock.js');
 const f=new Flight(preset('orbital-tug'),'orbit',100);
 try{
  f.maneuver={universalTime:220,time:120,complete:false};
  const result=advanceCoastFleet(f,300);
  assert.equal(result.reason,'予定噴射の直前');assert.equal(f.universalTime,160);
  assert.equal(f.maneuver.universalTime-f.universalTime,60);
  assert.equal(physicalWarpStop(f),'予定噴射の直前');
  assert.equal(result.blocker.scheduledTime,220);assert.equal(result.blocker.overdue,false);
  assert.equal(f.throttle,0);assert.equal(f.started,false);
 }finally{f.dispose();}
});
