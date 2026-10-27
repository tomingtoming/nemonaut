import test from 'node:test';
import assert from 'node:assert/strict';
import {createRunwaySelection} from '../dist/runway-selection.js';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {saveFlight,loadFlight} from '../dist/flight-save.js';

test('runway selection follows each vessel and a restored instance without leaking edits',()=>{
 const selection=createRunwaySelection(),a={vesselId:'a'},b={vesselId:'b'},events=[];
 selection.subscribe(end=>{events.push(end);selection.bind(current);});
 let current=a;selection.bind(a);selection.set('27');
 current=b;selection.bind(b);assert.equal(selection.end,'09');assert.equal(a.runwayEnd,'27');
 selection.set('09');assert.equal(b.runwayEnd,'09');
 current=a;selection.bind(a);assert.equal(selection.end,'27');
 current={vesselId:'a',runwayEnd:'09'};selection.bind(current);
 assert.equal(selection.end,'09');assert.equal(a.runwayEnd,'27');
 assert.deepEqual(events,['27','09','27','09']);
 assert.throws(()=>selection.set('18'));assert.equal(current.runwayEnd,'09');
 current=null;selection.bind(null);selection.set('27');
 current={};selection.bind(current);assert.equal(selection.end,'09');
});

test('flight saves preserve independent runway ends, migrate missing fields and reject corrupt values',()=>{
 const f=new Flight(preset('plane'),'runway');let restored,legacy;
 try{
  f.runwayEnd='27';const child=new Flight(preset('plane-large'),'runway');child.runwayEnd='09';f.detached.push(child);
  const data=saveFlight(f);restored=loadFlight(data);
  assert.equal(restored.runwayEnd,'27');assert.equal(restored.detached[0].runwayEnd,'09');
  delete data.runwayEnd;delete data.detached[0].runwayEnd;legacy=loadFlight(data);
  assert.equal(legacy.runwayEnd,'09');assert.equal(legacy.detached[0].runwayEnd,'09');
  data.runwayEnd='18';assert.throws(()=>loadFlight(data),/runway/);
  data.runwayEnd='09';data.detached[0].runwayEnd=null;assert.throws(()=>loadFlight(data),/runway/);
 }finally{legacy?.dispose();restored?.dispose();f.dispose();}
});
