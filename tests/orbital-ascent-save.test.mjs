import test from 'node:test';import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';import {preset} from '../dist/catalog.js';
import {saveFlight,loadFlight} from '../dist/flight-save.js';
import {orbitalAscentSettings} from '../dist/orbital-ascent-settings.js';
test('orbital targets survive per-vessel restoration without a running controller',()=>{
 const f=new Flight(preset('launcher'),'land');let restored;
 try{
  f.orbitalAscentSettings={altitude:120000,inclination:90};const child=new Flight(preset('atlas'),'land');child.orbitalAscentSettings={altitude:200000,inclination:30};f.detached.push(child);
  const data=saveFlight(f);restored=loadFlight(data);assert.deepEqual(restored.orbitalAscentSettings,f.orbitalAscentSettings);assert.deepEqual(restored.detached[0].orbitalAscentSettings,child.orbitalAscentSettings);
  assert.equal(restored.ascentActive,undefined);data.orbitalAscentSettings.inclination=181;assert.throws(()=>loadFlight(data));
 }finally{restored?.dispose();f.dispose();}
});
test('target validation rejects unsupported or non-finite values',()=>{
 assert.deepEqual(orbitalAscentSettings(),{altitude:120000,inclination:0});
 for(const settings of [{altitude:70000},{altitude:NaN},{inclination:-1},{inclination:Infinity}])assert.throws(()=>orbitalAscentSettings(settings));
});
