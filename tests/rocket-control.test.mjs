import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
const run=(f,n,input={})=>{for(let i=0;i<n;i++)f.step(1/120,input);};
test('Rocket exceeds 400 m/s under sustained thrust',()=>{const f=new Flight(preset('rocket'),'land');try{f.throttle=1;f.stageNext();run(f,12000);assert.ok(f.vel.length()>600);assert.equal(f.crashed,false);}finally{f.dispose();}});
test('Rocket pitch and yaw move different fin pairs and gimbal axes',()=>{for(const axis of ['pitch','yaw']){const f=new Flight(preset('rocket'),'land');try{f.sas=false;f.pos.y=100;run(f,30,{[axis]:1});const angles=[...f.deflections.values()];assert.equal(angles.filter(a=>Math.abs(a)>.05).length,2);const g=[...f.gimbals.values()][0];assert.ok(Math.abs(axis==='pitch'?g.x:g.z)>.05);assert.ok(Math.abs(axis==='pitch'?g.z:g.x)<1e-6);}finally{f.dispose();}}});
test('Gimballed thrust produces steering moment even without atmospheric flow',()=>{const f=new Flight(preset('rocket'),'land');try{f.pos.y=200000;f.sas=false;f.throttle=1;f.stageNext();run(f,20,{pitch:1});assert.ok(f.telemetry.torque.x>100);assert.ok([...f.gimbals.values()][0].length()>0);f.throttle=0;f.step(1/120);assert.equal(f.lastThrust,0);assert.ok(f.telemetry.torque.length()<1e-4);}finally{f.dispose();}});
