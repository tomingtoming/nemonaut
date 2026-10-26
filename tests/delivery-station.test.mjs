import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {deliveryStation} from '../dist/delivery-station.js';
import {DELIVERY_SITE,deliverySitePosition} from '../dist/delivery-sites.js';
const history=[{type:'delivery',siteId:DELIVERY_SITE.id,probePartId:'probe-1',vesselId:'old-id',name:'Old name'}];
function vessel(){return {vesselId:'new-id',vesselName:'Renamed station',parts:[{id:'probe-1',type:'probe',p:[0,0,0]}],pos:deliverySitePosition(123),q:new T.Quaternion(),universalTime:123,charge:new Map([['probe-1',12]]),thermal:new Map(),landed:true,crashed:false};}
test('Station follows the recorded probe after vessel identity/name changes, not a matching name',()=>{
 const v=vessel(),decoy={...v,vesselId:'old-id',vesselName:'Old name',parts:[{id:'another',type:'probe',p:[0,0,0]}]};
 const result=deliveryStation(history,[decoy,v]);assert.equal(result.vessel,v);assert.ok(result.distance<.01);assert.equal(result.charge,12);assert.equal(result.landed,true);
 assert.equal(deliveryStation([], [v]),null);assert.equal(deliveryStation(history,[decoy]).vessel,null);assert.equal(deliveryStation(history,[]).record,history[0]);
});
test('Saved and live station states agree without mutating the achievement',()=>{
 const v=vessel(),saved={...v,pos:v.pos.toArray(),q:v.q.toArray(),state:{landed:v.landed,crashed:v.crashed},charge:[...v.charge],thermal:[...v.thermal]},before=JSON.stringify(history);
 const live=deliveryStation(history,[v]),stored=deliveryStation(history,[JSON.parse(JSON.stringify(saved))]);
 for(const key of ['distance','charge','landed','damaged'])assert.equal(stored[key],live[key]);assert.equal(JSON.stringify(history),before);
});
test('Moved, airborne, unpowered and damaged stations report current state independently of completion',()=>{
 const v=vessel();v.pos.x+=100;v.landed=false;v.charge.set('probe-1',0);v.thermal.set('probe-1',{failed:true});
 const result=deliveryStation(history,[v]);assert.ok(result.distance>90);assert.equal(result.landed,false);assert.equal(result.charge,0);assert.equal(result.damaged,true);assert.equal(result.record,history[0]);
});

test('Station power includes attached storage in live and saved vessels',()=>{
 const v=vessel();v.parts.push({id:'battery',type:'battery',p:[0,.35,0]});v.charge.set('battery',900);
 const live=deliveryStation(history,[v]);assert.deepEqual(live.power,{stored:912,capacity:1200});
 const saved={...v,pos:v.pos.toArray(),q:v.q.toArray(),charge:[...v.charge],thermal:[]};
 assert.deepEqual(deliveryStation(history,[saved]).power,live.power);assert.equal(live.charge,12);
});
