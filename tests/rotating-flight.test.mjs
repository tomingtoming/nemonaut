import test from 'node:test';import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';import {preset} from '../dist/catalog.js';
import {surfaceRelativeVelocity,inertialToFixed,PRIMARY_ROTATION_PERIOD} from '../dist/surface-frame.js';
import {bodyAltitude} from '../dist/celestial.js';
const com=f=>f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));
const speed=f=>surfaceRelativeVelocity(com(f),f.vel,f.universalTime).length();
const run=(f,seconds,input={})=>{for(let i=0;i<seconds*120;i++)f.step(1/120,input);};

test('ground vehicles stay at the rotating launch site with no fictitious wind or wheel motion',()=>{
 for(const time of [0,PRIMARY_ROTATION_PERIOD/4,100000])for(const kind of ['rover','plane','rocket']){
  const f=new Flight(preset(kind),'land',time);try{
   assert.ok(speed(f)<1e-9);assert.ok(f.vel.length()>174&&f.vel.length()<176);
   run(f,10);const fixed=inertialToFixed(f.pos,f.universalTime);
   assert.ok(Math.hypot(fixed.x,fixed.z)<.15,kind+' remains at launch meridian');
   assert.ok(speed(f)<.03,kind+' relative speed');assert.equal(f.crashed,false);assert.equal(f.landed,true,kind+' rests on contacts');
   assert.ok([...f.wheelMotion.values()].every(w=>Math.abs(w.speed)<.03));
  }finally{f.dispose();}
 }
});

test('rover drives in either local direction at different universal times',()=>{
 for(const time of [0,4000])for(const drive of [-1,1]){
  const f=new Flight(preset('rover'),'land',time);try{f.reactionEnabled=false;run(f,1);const before=inertialToFixed(f.pos,f.universalTime);f.stageNext();run(f,3,{drive});
   const after=inertialToFixed(f.pos,f.universalTime);assert.ok((after.z-before.z)*drive>5);assert.equal(f.crashed,false);assert.ok(speed(f)<18);
  }finally{f.dispose();}
 }
});

test('rocket transitions from rotating ground contact into inertial free flight',()=>{
 for(const time of [0,4000]){const f=new Flight(preset('rocket'),'land',time);try{
  f.stageNext();f.throttle=1;run(f,12);
  assert.ok(bodyAltitude(com(f),f.universalTime)>80);assert.ok(speed(f)>10);assert.equal(f.crashed,false);assert.ok(f.vel.length()>100);assert.ok(f.fuelRatio<1);
 }finally{f.dispose();}}
});
