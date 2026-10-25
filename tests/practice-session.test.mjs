import test from 'node:test';
import assert from 'node:assert/strict';
import {PracticeSession} from '../dist/practice-session.js';
import {preset} from '../dist/catalog.js';
import {worldFromFlight,flightFromWorld} from '../dist/world-save.js';
import {launchWorld} from '../dist/world-operations.js';
import {gameRecord} from '../dist/game-save.js';
import {loadFlight,saveFlight} from '../dist/flight-save.js';
import {GAME_KEY,writeStoredGame,readStoredGame} from '../dist/game-storage.js';

function fixture(){
 const world=launchWorld(worldFromFlight(null,{universalTime:5000}),{parts:preset('rover'),name:'Survey',environment:'land'});
 const draft={parts:preset('launcher'),name:'Practice rocket',bay:'vab',environment:'orbit'};
 return {game:gameRecord({world,draft}),draft};
}
function storage(){const data=new Map();return {data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};}

test('practice burn and separation cannot advance or replace the normal world, autosave or quicksave',()=>{
 const {game,draft}=fixture(),before=structuredClone(game),s=storage();
 writeStoredGame(s,game);const normal=s.getItem(GAME_KEY);s.setItem('orbital-foundry-flight-v1','normal-quick');
 const session=new PracticeSession(game,draft),world=session.initialWorld;
 assert.equal(world.vessels.length,1);assert.equal(world.universalTime,5000);
 assert.notEqual(world.activeVesselId,game.world.activeVesselId);
 assert.deepEqual(world.history.map(e=>e.environment),['orbit']);
 const f=loadFlight(flightFromWorld(world));
 try{
  const fuelBefore=[...f.fuel.values()].reduce((a,b)=>a+b,0);f.stageNext();f.throttle=.2;for(let i=0;i<240;i++)f.step(1/120);f.stageNext();
  assert.ok([...f.fuel.values()].reduce((a,b)=>a+b,0)<fuelBefore);assert.ok(f.universalTime>game.world.universalTime);assert.ok(f.detached.length);
  const saved=saveFlight(f,{worldHistory:world.history});
  session.saveFlight(saved);saved.parts[0].id='mutated';
  const replay=loadFlight(session.loadFlight());
  try{assert.equal(replay.universalTime,f.universalTime);assert.equal(replay.detached.length,f.detached.length);assert.deepEqual(replay.fuel,f.fuel);}finally{replay.dispose();}
  const altered=session.loadFlight();altered.parts[0].id='another';assert.notEqual(session.loadFlight().parts[0].id,'another');
  session.saveHome(s);
  assert.equal(s.getItem(GAME_KEY),normal);assert.equal(s.getItem('orbital-foundry-flight-v1'),'normal-quick');
  assert.deepEqual(readStoredGame(s).game,JSON.parse(JSON.stringify(game)));assert.deepEqual(session.home,game);assert.deepEqual(game,before);
  const exit=session.home;exit.world.vessels.length=0;assert.equal(session.home.world.vessels.length,1);
  assert.throws(()=>session.saveFlight(flightFromWorld(game.world)),/通常世界/);
 }finally{f.dispose();}
});

test('a new practice session has no inherited quicksave and failed saves leave normal data intact',()=>{
 const {game,draft}=fixture(),s=storage();writeStoredGame(s,game);const before=new Map(s.data);
 const session=new PracticeSession(game,draft);assert.throws(()=>session.loadFlight(),/まだありません/);
 assert.throws(()=>new PracticeSession(game,{...draft,environment:'land'}),/練習用/);
 const failing={...s,setItem(){throw Error('QuotaExceeded');}};
 assert.throws(()=>session.saveHome(failing),/Quota/);assert.deepEqual(s.data,before);
 session.saveFlight(flightFromWorld(session.initialWorld));
 assert.throws(()=>new PracticeSession(game,draft).loadFlight(),/まだありません/);
 assert.deepEqual(readStoredGame(s).game,JSON.parse(JSON.stringify(game)));
});
