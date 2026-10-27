import * as T from 'three';
import test from 'node:test';import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';import {preset} from '../dist/catalog.js';
import {bodyUp} from '../dist/celestial.js';
// Controlled drops isolate suspension impact from pilot inputs and aerodynamics.
for(const kind of ['plane','plane-large'])for(const dt of [1/60,1/120,1/240]){
 test(`${kind} rejects a 16 m/s gear impact at dt=${dt}`,()=>{
  const f=new Flight(preset(kind),'runway');
  try{const up=bodyUp(f.pos,f.universalTime);f.pos.addScaledVector(up,.25);f.vel.addScaledVector(up,-16);f.sas=false;
   for(let i=0;i<2/dt&&!f.crashed;i++)f.step(dt);
   assert.equal(f.crashed,true);
  }finally{f.dispose();}
 });
 test(`${kind} survives a gentle gear touchdown at dt=${dt}`,()=>{
  const f=new Flight(preset(kind),'runway');
  try{const up=bodyUp(f.pos,f.universalTime);f.pos.addScaledVector(up,.25);f.vel.addScaledVector(up,-2);f.sas=false;
   for(let i=0;i<4/dt;i++)f.step(dt);
   assert.equal(f.crashed,false);assert.equal(f.landed,true);
  }finally{f.dispose();}
 });
}

for(const dt of [1/60,1/120,1/240])for(const angle of [-15,0])test(`forward gear impact cannot hide in suspension at ${dt}, pitch ${angle}`,()=>{
 const f=new Flight(preset('plane-large'),'runway');
 try{const up=bodyUp(f.pos,0),forward=new T.Vector3(0,0,1).applyQuaternion(f.q);f.pos.addScaledVector(up,3);f.vel.addScaledVector(up,-16).addScaledVector(forward,80);f.q.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-angle*Math.PI/180));f.sas=false;
  for(let i=0;i<2/dt&&!f.crashed;i++)f.step(dt);
  assert.equal(f.crashed,true);
 }finally{f.dispose();}
});
test('rapid airborne descent alone is not a ground impact',()=>{
 const f=new Flight(preset('plane-large'),'runway');
 try{const up=bodyUp(f.pos,0);f.pos.addScaledVector(up,100);f.vel.addScaledVector(up,-16);f.sas=false;
  for(let i=0;i<120;i++)f.step(1/120);
  assert.equal(f.telemetry.contacts,0);assert.equal(f.crashed,false);
 }finally{f.dispose();}
});
