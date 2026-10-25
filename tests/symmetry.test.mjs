import test from 'node:test';import assert from 'node:assert/strict';
import {validateCraft} from '../dist/core.js';
import {editSymmetrySetting,normalizeSymmetry,symmetryTargets} from '../dist/symmetry.js';
import {extractBranch,placeBranch,moveBranch} from '../dist/assembly-branch.js';
import {freshLaunchParts} from '../dist/launch-fleet.js';
const craft=()=>[{id:'root',type:'probe',parent:null,p:[0,0,0],r:[0,0,0],stage:0},...Array.from({length:4},(_,i)=>({id:'w'+i,type:'wheel',parent:'root',p:[i,0,0],r:[0,0,0],stage:0,symmetryGroup:i<3?'group':'other'}))];
test('Linked settings affect only corresponding wheels, while individual edits preserve membership',()=>{
 const original=craft(),before=structuredClone(original);let edited=editSymmetrySetting(original,'w0','driveEnabled',false);
 assert.deepEqual(original,before);assert.deepEqual(edited.slice(1).map(p=>p.driveEnabled),[false,false,false,undefined]);
 edited=editSymmetrySetting(edited,'w1','driveEnabled',true,false);assert.equal(edited[1].driveEnabled,false);assert.equal(edited[2].driveEnabled,true);assert.equal(symmetryTargets(edited,'w1').length,3);
 edited=editSymmetrySetting(edited,'w0','stage',4);assert.deepEqual(edited.map(p=>p.stage),[0,4,4,4,0]);
 const restored=validateCraft({version:1,parts:JSON.parse(JSON.stringify(edited))});assert.deepEqual(restored,edited);
 assert.throws(()=>editSymmetrySetting(original,'w0','stage',10));assert.throws(()=>editSymmetrySetting(original,'w0','p',[1,2,3]));assert.throws(()=>editSymmetrySetting(original,'w0','reactionEnabled',true));
});
test('Malformed or cross-type groups are rejected and legacy designs remain independent',()=>{
 for(const value of ['',42,{},'x'.repeat(201)]){const p=craft();p[1].symmetryGroup=value;assert.throws(()=>validateCraft({version:1,parts:p}));}
 const p=craft();p[0].symmetryGroup='group';assert.throws(()=>validateCraft({version:1,parts:p}));
 for(const q of p)delete q.symmetryGroup;assert.equal(symmetryTargets(validateCraft({version:1,parts:p}),'w0').length,1);
});
test('Copies and launches isolate groups; partial branches and deletion shed singleton membership',()=>{
 const p=craft(),whole=extractBranch(p,'root'),copy=placeBranch(p,whole,{position:[0,8,0],rotation:[0,0,0]}).parts.slice(p.length);
 assert.notEqual(copy[1].symmetryGroup,p[1].symmetryGroup);assert.equal(copy[1].symmetryGroup,copy[3].symmetryGroup);assert.equal(copy[4].symmetryGroup,undefined);
 const single=placeBranch(p,extractBranch(p,'w0'),{position:[0,2,0],rotation:[0,0,0],parent:'root'}).parts.at(-1);assert.equal(single.symmetryGroup,undefined);
 const a=freshLaunchParts(p),b=freshLaunchParts(p);assert.notEqual(a[1].symmetryGroup,b[1].symmetryGroup);assert.equal(a[1].symmetryGroup,a[2].symmetryGroup);
 const remaining=normalizeSymmetry(p.filter(q=>!['w1','w2'].includes(q.id)));assert.equal(remaining[1].symmetryGroup,undefined);
});
test('Moving a branch splits crossing groups and preserves internal corresponding parts',()=>{
 const p=craft();p[2].parent='w0';const before=structuredClone(p);
 const result=moveBranch(p,'w0',{position:[2,3,4],rotation:[0,.2,0],parent:'root'}).parts;
 assert.deepEqual(p,before);assert.notEqual(result[1].symmetryGroup,'group');assert.equal(result[1].symmetryGroup,result[2].symmetryGroup);assert.equal(result[3].symmetryGroup,undefined);
 const changed=editSymmetrySetting(result,'w0','stage',3);assert.equal(changed[2].stage,3);assert.equal(changed[3].stage,0);
});
