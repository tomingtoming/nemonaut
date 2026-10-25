import test from 'node:test';
import assert from 'node:assert/strict';
import {preset} from '../dist/catalog.js';
import {saveFlight,loadFlight} from '../dist/flight-save.js';
import {worldFromFlight,flightFromWorld,validateWorld} from '../dist/world-save.js';
import {launchWorld,selectWorldVessel,retireWorldVessel} from '../dist/world-operations.js';
import {gameRecord,validateGame} from '../dist/game-save.js';

test('launch and recovery records survive flight capture and recovery of the last vessel',()=>{
 let world=launchWorld(worldFromFlight(null,{universalTime:100}),{parts:preset('rover'),name:'Survey',environment:'land'});
 const id=world.activeVesselId,initial=structuredClone(world.history);
 const snapshot=flightFromWorld(world),f=loadFlight(snapshot);
 try{
  for(let i=0;i<240;i++)f.step(1/120);
  world=worldFromFlight(saveFlight(f,{...snapshot.meta}));
 }finally{f.dispose();}
 assert.deepEqual(world.history,initial);
 const before=structuredClone(world),result=retireWorldVessel(world,id,'recover');world=result.world;
 assert.deepEqual(before.history,initial);assert.equal(world.vessels.length,0);assert.deepEqual(world.history.map(e=>e.type),['launch','recover']);
 assert.equal(world.history[0].universalTime,100);assert.ok(world.history[1].universalTime>101);assert.ok(world.history[1].missionTime>1);assert.equal(world.history[1].vesselId,id);
 const draft={parts:[],name:'Next',bay:'vab',environment:'land'},game=validateGame(JSON.parse(JSON.stringify(gameRecord({world,draft}))));
 assert.deepEqual(game.world.history,world.history);
 world=launchWorld(game.world,{parts:preset('rocket'),name:'Next',environment:'land'});
 assert.deepEqual(world.history.slice(0,2),game.world.history);assert.equal(world.history.length,3);
});

test('selection, save/restore and rejected recovery never invent or duplicate events',()=>{
 let world=launchWorld(worldFromFlight(null),{parts:preset('rocket'),name:'A',environment:'orbit'});
 world=launchWorld(world,{parts:preset('rocket'),name:'B',environment:'orbit'});
 const before=structuredClone(world),a=world.vessels.find(v=>v.vesselId!==world.activeVesselId).vesselId;
 const selected=selectWorldVessel(world,a).world;assert.deepEqual(selected.history,world.history);
 assert.deepEqual(worldFromFlight(flightFromWorld(selected)).history,world.history);
 assert.throws(()=>retireWorldVessel(world,a,'recover'));assert.deepEqual(world,before);
 const terminated=retireWorldVessel(world,a,'terminate').world;
 assert.deepEqual(terminated.history.map(e=>e.type),['launch','launch','terminate']);
 assert.ok(!terminated.vessels.some(v=>v.vesselId===terminated.history.at(-1).vesselId));
});

test('legacy worlds have no invented history; invalid history cannot silently enter a save',()=>{
 const world=launchWorld(worldFromFlight(null),{parts:preset('rocket'),name:'A',environment:'orbit'});
 const legacy=structuredClone(world);delete legacy.history;assert.deepEqual(validateWorld(legacy).history,[]);
 for(const mutate of [w=>w.history[0].type='moon-landing',w=>w.history[0].universalTime=1,w=>w.history[0].universalTime=-1,w=>w.history[0].missionTime=NaN,w=>w.history.push(structuredClone(w.history[0]))]){
  const bad=structuredClone(world);mutate(bad);assert.throws(()=>validateWorld(bad));
 }
 const full=structuredClone(world);full.history=Array.from({length:10000},(_,i)=>({...world.history[0],id:'event-'+i}));
 const before=structuredClone(full);assert.throws(()=>launchWorld(full,{parts:preset('rocket'),name:'B',environment:'land'}),/件数/);assert.deepEqual(full,before);
});
