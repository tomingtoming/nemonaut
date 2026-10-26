import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {buoyancyBalance,displacedVolume} from '../dist/buoyancy.js';
import {preset} from '../dist/catalog.js';import {statistics} from '../dist/core.js';
test('Design buoyancy tracks ballast mass without changing volume or the design',()=>{
 const parts=preset('sub'),before=structuredClone(parts),empty=buoyancyBalance(parts,0),full=buoyancyBalance(parts,1);
 assert.ok(empty.mass<empty.displacement);assert.ok(full.mass>full.displacement);assert.equal(empty.volume,full.volume);assert.deepEqual(empty.center,full.center);
 assert.equal(full.mass-empty.mass,2100);assert.ok(empty.com.distanceTo(full.com)>.03);
 for(const ballast of [0,.25,.5,1]){const b=buoyancyBalance(parts,ballast),st=statistics(parts,1,ballast);assert.equal(b.mass,st.mass);assert.ok(b.com.distanceTo(st.com)<1e-12);}
 assert.deepEqual(parts,before);assert.deepEqual(buoyancyBalance([]).center.toArray(),[0,0,0]);
});
test('Buoyancy accounts for rotated offset centers and follows rigid translation',()=>{
 const parts=preset('plane'),b=buoyancyBalance(parts),shift=new T.Vector3(4,-2,7),moved=parts.map(p=>({...p,p:new T.Vector3(...p.p).add(shift).toArray()})),next=buoyancyBalance(moved);
 assert.ok(next.center.distanceTo(b.center.clone().add(shift))<1e-10);assert.ok(next.com.distanceTo(b.com.clone().add(shift))<1e-10);
 assert.equal(next.volume,b.volume);assert.ok(parts.every(p=>displacedVolume(p)>0));
 const wing=parts.find(p=>p.type==='wing');if(wing){const a=buoyancyBalance([wing]),rotated=buoyancyBalance([{...wing,r:[0,0,Math.PI/2]}]);assert.ok(a.center.distanceTo(rotated.center)>.01);}
});
