import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {assemblyTree,extractBranch,placeBranch} from '../dist/assembly-branch.js';import {preset} from '../dist/catalog.js';import {validateCraft} from '../dist/core.js';
test('Tree lists parents before children and reports complete branch deletion counts',()=>{
 const parts=preset('launcher'),rows=assemblyTree(parts);assert.equal(rows.length,parts.length);for(const p of parts.filter(p=>p.parent)){const a=rows.findIndex(r=>r.id===p.parent),b=rows.findIndex(r=>r.id===p.id);assert.ok(a<b);assert.equal(rows[b].depth,rows[a].depth+1);}assert.equal(rows[0].count,parts.length);assert.deepEqual(assemblyTree([]),[]);
});
test('Branch placement preserves settings and internal geometry under translation and rotation',()=>{
 const parts=preset('rocket'),root=parts.find(p=>p.type==='tank');root.stage=3;root.driveEnabled=false;const before=structuredClone(parts),branch=extractBranch(parts,root.id),r=placeBranch(parts,branch,{position:[5,6,7],rotation:[0,0,Math.PI/2],parent:parts[0].id});
 assert.deepEqual(parts,before);assert.equal(r.parts.length,parts.length+branch.parts.length);const copy=r.parts.find(p=>p.id===r.rootId);assert.equal(copy.stage,3);assert.equal(copy.driveEnabled,false);assert.ok(new T.Vector3(...copy.p).distanceTo(new T.Vector3(5,6,7))<1e-9);
 const delta=new T.Quaternion().setFromEuler(new T.Euler(0,0,Math.PI/2)).multiply(new T.Quaternion().setFromEuler(new T.Euler(...root.r)).invert());
 for(let i=0;i<branch.parts.length;i++){const original=branch.parts[i],cloned=r.parts[parts.length+i],expected=new T.Vector3(...original.p).sub(new T.Vector3(...root.p)).applyQuaternion(delta).add(new T.Vector3(5,6,7));assert.ok(new T.Vector3(...cloned.p).distanceTo(expected)<1e-8);assert.equal(cloned.stage,original.stage);assert.ok(!parts.some(p=>p.id===cloned.id));}
 assert.equal(JSON.stringify(validateCraft({version:1,parts:JSON.parse(JSON.stringify(r.parts))})),JSON.stringify(r.parts));
});
test('Docking references are remapped internally and dropped at the extracted boundary',()=>{
 const parts=preset('docking'),bond=parts.find(p=>p.dockPartner&&p.parent===p.dockPartner),branch=extractBranch(parts,bond.id);assert.equal(branch.parts.find(p=>p.id===bond.id).dockPartner,undefined);
 const whole=extractBranch(parts,parts.find(p=>!p.parent).id),result=placeBranch([],whole,{position:[0,0,0],rotation:[0,0,0]});for(const p of result.parts.filter(p=>p.dockPartner))assert.equal(result.parts.find(q=>q.id===p.dockPartner).dockPartner,p.id);
});
test('Invalid placement and capacity failures never partially modify the original craft',()=>{
 const parts=preset('rocket'),before=structuredClone(parts),branch=extractBranch(parts,parts[0].id);for(const pose of [{position:[NaN,0,0],rotation:[0,0,0]},{position:[0,0,0],rotation:[0,0,0],parent:'missing'}])assert.throws(()=>placeBranch(parts,branch,pose));assert.throws(()=>placeBranch(parts,branch,{position:[0,0,0],rotation:[0,0,0]},()=>parts[0].id));
 const large=structuredClone(parts);for(let i=large.length;i<400;i++)large.push({...structuredClone(parts[0]),id:'extra-'+i,parent:parts[0].id});assert.throws(()=>placeBranch(large,branch,{position:[0,0,0],rotation:[0,0,0]}));assert.deepEqual(parts,before);
});
