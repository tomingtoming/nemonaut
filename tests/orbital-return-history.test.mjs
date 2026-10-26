import test from 'node:test';
import assert from 'node:assert/strict';
import {preset} from '../dist/catalog.js';
import {launchWorld} from '../dist/world-operations.js';
import {worldFromFlight} from '../dist/world-save.js';
import {appendHistory,validateHistory} from '../dist/world-history.js';
import {historyActionLabel} from '../dist/departure-mode.js';

// Evidence-only fixtures. Real return and recovery are exercised in world-mission.
test('return attribution follows recovered parts across new vessel IDs and rejects lunar or incomplete returns',()=>{
 const world=launchWorld(worldFromFlight(null),{parts:preset('returner'),name:'Return',environment:'land'});
 const vessel=world.vessels[0],history=appendHistory({...world,universalTime:100},'orbit',vessel,{
  orbit:{bodyId:'planet',periapsis:80000,apoapsis:90000},launchEventIds:[world.history[0].id]
 });
 const capsule={...vessel,vesselId:crypto.randomUUID(),parts:vessel.parts.slice(0,3),state:{...vessel.state,time:200}};
 const next={history,universalTime:200},before=structuredClone(history);
 const returned=appendHistory(next,'recover',capsule,{bodyId:'planet'}),event=returned.at(-1);
 assert.deepEqual(event.orbitEventIds,[history.at(-1).id]);assert.equal(event.parts,3);assert.deepEqual(history,before);
 assert.match(historyActionLabel(event),/軌道から帰還/);
 assert.deepEqual(validateHistory(JSON.parse(JSON.stringify(returned)),200),returned);
 const moon=appendHistory(next,'recover',capsule,{bodyId:'moon'}).at(-1);
 assert.equal(moon.orbitEventIds,undefined);assert.equal(historyActionLabel(moon),'回収');
 const mixed={...capsule,parts:[...capsule.parts,{...capsule.parts[0],id:'unknown'}]};
 assert.equal(appendHistory(next,'recover',mixed,{bodyId:'planet'}).at(-1).orbitEventIds,undefined);
 const legacy=history.map(e=>{const copy={...e};if(e.type==='orbit'){delete copy.partIds;delete copy.launchEventIds;}return copy;});
 assert.equal(appendHistory({...next,history:legacy},'recover',capsule,{bodyId:'planet'}).at(-1).orbitEventIds,undefined);
 for(const mutate of [
  e=>e.orbitEventIds=['missing'],e=>e.orbitEventIds=[history[0].id],e=>e.bodyId='moon',
  e=>e.partIds[0]='unknown',e=>delete e.partIds,e=>e.type='terminate'
 ]){const bad=structuredClone(returned);mutate(bad.at(-1));assert.throws(()=>validateHistory(bad,200));}
});
