import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {preset} from '../dist/catalog.js';import {createFuel} from '../dist/resources.js';
import {thrustBalance,stageThrustDiagnostics,equipmentDiagnostics} from '../dist/design-diagnostics.js';

test('Symmetric expedition stages balance thrust and preserve design data',()=>{
 const parts=preset('lunar-expedition'),before=structuredClone(parts),result=stageThrustDiagnostics(parts);
 assert.deepEqual(result.stages.map(s=>s.stage),[0,1,2]);
 assert.deepEqual(result.stages.map(s=>s.partIds.length),[29,13,8]);
 for(const stage of result.stages){assert.ok(stage.full.offset<1e-10);assert.ok(stage.low.offset<1e-10);assert.ok(stage.full.mass>stage.low.mass);}
 assert.deepEqual(parts,before);
});

test('Off-axis engine exposes a moment arm and off-axis fuel changes it',()=>{
 const parts=preset('lunar-return'),engine=parts.find(p=>p.type==='engine'),tank=parts.find(p=>p.type==='tank');
 engine.p[0]=1;tank.p[0]=2;
 const fuel=createFuel(parts),before=[...fuel],active=new Set([engine.id]);
 const full=thrustBalance(parts,active,fuel);assert.ok(full.offset>.1);
 fuel.set(tank.id,fuel.get(tank.id)*.1);const low=thrustBalance(parts,active,fuel);
 assert.ok(Math.abs(full.com[0]-low.com[0])>.7);
 assert.ok(full.torque[2]<0&&low.torque[2]>0,'Fuel depletion moves the CG across the thrust line and reverses the moment');
 assert.ok(Math.abs(full.torque[2]-(engine.p[0]-full.com[0])*full.thrust)<1e-7);
 const translated=parts.map(p=>({...p,p:new T.Vector3(...p.p).add(new T.Vector3(100,-20,40)).toArray()}));
 assert.ok(Math.abs(thrustBalance(translated,active,new Map(before)).offset-full.offset)<1e-10);
 assert.deepEqual([...createFuel(parts)],before);
});

test('Opposed thrusters report a pure couple rather than an invented thrust line',()=>{
 const parts=[{id:'tank',type:'tank',p:[0,0,0],r:[0,0,0],stage:0,parent:null},
  {id:'a',type:'engine',p:[1,-2,0],r:[0,0,0],stage:0,parent:'tank'},
  {id:'b',type:'engine',p:[-1,-2,0],r:[0,0,Math.PI],stage:0,parent:'tank'}];
 const result=thrustBalance(parts,new Set(['a','b']));assert.equal(result.offset,null);assert.ok(result.thrust<1e-8);assert.ok(Math.abs(result.torque[2])>80000);
});

test('Equipment counts respect disabled reaction wheels and report actual control surfaces',()=>{
 const parts=preset('lunar-return');parts.find(p=>p.type==='capsule').reactionEnabled=false;
 const result=equipmentDiagnostics(parts);assert.equal(result.wheels.length,0);assert.equal(result.shields.length,1);assert.equal(result.chutes.length,1);assert.ok(result.capacity>0);
 const wing={id:'e',type:'elevator',p:[0,0,0],r:[0,0,0],stage:0,parent:null};
 assert.deepEqual(equipmentDiagnostics([wing]).surfaces,['e']);assert.deepEqual(stageThrustDiagnostics([wing]).stages,[]);
});

test('Vacuum jet stages do not consume fuel reserved for a later rocket stage',()=>{
 const parts=[{id:'c',type:'cockpit',p:[0,2,0],r:[0,0,0],stage:0,parent:null},
  {id:'t',type:'tank',p:[0,0,0],r:[0,0,0],stage:0,parent:'c'},
  {id:'j',type:'jet',p:[0,-2,0],r:[0,0,0],stage:0,parent:'t'},
  {id:'e',type:'engine',p:[0,-4,0],r:[0,0,0],stage:1,parent:'t'}];
 const result=stageThrustDiagnostics(parts,null,{density:0});
 assert.deepEqual(result.stages.map(s=>s.stage),[1]);assert.equal(result.stages[0].full.thrust,45000);
 assert.ok(Math.abs(result.stages[0].full.mass-result.stages[0].low.mass-1620)<1e-8);
});
