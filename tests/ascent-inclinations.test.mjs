import test from 'node:test';import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';import {preset} from '../dist/catalog.js';
import {PRIMARY_ROTATION_PERIOD} from '../dist/surface-frame.js';
import {radial} from '../dist/planet.js';
import {orbitInclination} from '../tools/ascent-plane.mjs';
import {AscentSession} from '../tools/ascent-session.mjs';
for(const kind of ['launcher','atlas'])for(const [inclination,epoch]of [[30,0],[90,PRIMARY_ROTATION_PERIOD/4],[150,PRIMARY_ROTATION_PERIOD/2]])test(`${kind} reaches 120 km at inclination ${inclination} from epoch ${epoch}`,()=>{
 const f=new Flight(preset(kind),'land',epoch),s=new AscentSession();
 const actual=()=>orbitInclination(radial(f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q))),f.vel);
 try{
  s.start(f,{altitude:120000,inclination});
  for(let i=0;i<1201*120&&s.owner;i++){s.step(f,1/120);f.step(1/120);}
  assert.equal(s.state,'complete');assert.equal(f.crashed,false);assert.equal(f.throttle,0);
  assert.ok(f.orbit.periapsis>=118000);assert.ok(f.orbit.apoapsis<=122000);assert.ok(Math.abs(actual()-inclination)<=.25);
  const fuel=[...f.fuel];for(let i=0;i<60*120;i++)f.step(1/120);
  assert.ok(Math.abs(actual()-inclination)<=.25);assert.ok(f.orbit.periapsis>=117900);assert.ok(f.orbit.apoapsis<=122100);assert.deepEqual([...f.fuel],fuel);
 }finally{f.dispose();}
});
