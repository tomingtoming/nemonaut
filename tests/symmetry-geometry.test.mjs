import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {editSymmetryPose} from '../dist/symmetry-geometry.js';
import {placementSymmetryFrame,hasSymmetryGeometry} from '../dist/symmetry.js';
import {validateCraft} from '../dist/core.js';import {extractBranch,placeBranch,moveBranch} from '../dist/assembly-branch.js';
const pose=p=>new T.Matrix4().compose(new T.Vector3(...p.p),new T.Quaternion().setFromEuler(new T.Euler(...p.r)),new T.Vector3(1,1,1));
function near(a,b){assert.equal(a.length,b.length);for(let i=0;i<a.length;i++)assert.ok(Math.abs(a[i]-b[i])<1e-7,`${i}: ${a[i]} != ${b[i]}`);}
function fixture(mode='4',bay='vab',type='wheel',base=[2,1,0]){
 const count=mode==='mirror'?2:+mode,parts=[{id:'root',type:'probe',p:[0,0,0],r:[0,0,0],stage:0,parent:null}];
 for(let i=0;i<count;i++){
  const frame=placementSymmetryFrame(mode,bay,i,count),a=new T.Matrix4().fromArray(frame),p=new T.Vector3(...base).applyMatrix4(a),rot=a.clone();
  if(mode==='mirror')rot.multiply(a);if(mode==='mirror'&&i&&type==='wing')rot.multiply(new T.Matrix4().makeRotationY(Math.PI));
  const e=new T.Euler().setFromRotationMatrix(rot),member={id:'m'+i,type,parent:'root',p:p.toArray(),r:[e.x,e.y,e.z],stage:0,symmetryGroup:'g',symmetryFrame:frame};parts.push(member);
  const childPos=new T.Vector3(0,.4,.3).applyMatrix4(pose(member));parts.push({id:'c'+i,type:'rcs',parent:member.id,p:childPos.toArray(),r:[...member.r],stage:0});
 }return parts;
}
test('Radial position and rotation follow the saved axis in VAB and SPH, including child branches',()=>{
 for(const bay of ['vab','sph'])for(const count of ['2','3','4','6','8']){
  const original=fixture(count,bay),before=structuredClone(original),next=editSymmetryPose(original,'m0',{position:[3,2,1],rotation:[.3,.5,.7]});
  assert.deepEqual(original,before);const canonical=pose(next.find(p=>p.id==='m0'));
  for(let i=0;i<+count;i++){
   const member=next.find(p=>p.id==='m'+i),child=next.find(p=>p.id==='c'+i),frame=new T.Matrix4().fromArray(member.symmetryFrame);
   near(pose(member).toArray(),frame.multiply(canonical).toArray());near(pose(member).invert().multiply(pose(child)).toArray(),pose(original.find(p=>p.id===member.id)).invert().multiply(pose(original.find(p=>p.id===child.id))).toArray());
  }
  const last=next.find(p=>p.id==='m'+(+count-1)),back=editSymmetryPose(next,last.id,{position:last.p.map((v,i)=>v+(i===1?1:0)),rotation:last.r});assert.ok(back.some(p=>p.id==='m0'&&p.p.some((v,i)=>Math.abs(v-next[1].p[i])>1e-6)));
 }
});
test('Mirror editing from either side reflects translation and rotation while preserving wing handedness',()=>{
 for(const type of ['wheel','wing']){
  let p=fixture('mirror','sph',type);p=editSymmetryPose(p,'m0',{position:[3,2,1],rotation:[.2,.4,.6]});
  const left=p.find(p=>p.id==='m0'),right=p.find(p=>p.id==='m1'),f=new T.Matrix4().makeScale(-1,1,1),expected=f.clone().multiply(pose(left)).multiply(f);if(type==='wing')expected.multiply(new T.Matrix4().makeRotationY(Math.PI));near(pose(right).toArray(),expected.toArray());
  const edited=editSymmetryPose(p,'m1',{position:[-4,3,2],rotation:right.r});near(edited.find(p=>p.id==='m0').p,[4,3,2]);
 }
});
test('Individual mode and legacy groups move only the chosen branch; zero-radius groups stay finite',()=>{
 const p=fixture(),next=editSymmetryPose(p,'m0',{position:[5,3,2],rotation:[.4,0,0]},false);assert.deepEqual(next.filter(q=>!['m0','c0'].includes(q.id)),p.filter(q=>!['m0','c0'].includes(q.id)));
 const legacy=structuredClone(p);for(const q of legacy)delete q.symmetryFrame;assert.equal(hasSymmetryGeometry(legacy,'m0'),false);const old=editSymmetryPose(legacy,'m0',{position:[5,3,2],rotation:[.4,0,0]});assert.deepEqual(old.find(q=>q.id==='m1'),legacy.find(q=>q.id==='m1'));
 const axial=fixture('6','vab','wheel',[0,1,0]),rotated=editSymmetryPose(axial,'m0',{position:[0,2,0],rotation:[0,0,Math.PI/2]});for(const q of rotated)assert.ok([...q.p,...q.r].every(Number.isFinite));
});
test('Moving and copying the parent carries the symmetry axis; serialization retains it',()=>{
 const original=fixture('4'),rootPose={position:[8,3,2],rotation:[.3,.7,.2]},delta=pose({p:rootPose.position,r:rootPose.rotation});
 for(const transform of [p=>editSymmetryPose(p,'root',rootPose),p=>moveBranch(p,'root',rootPose).parts,p=>placeBranch([],extractBranch(p,'root'),rootPose).parts]){
  const moved=validateCraft({version:1,parts:JSON.parse(JSON.stringify(transform(original)))}),members=moved.filter(p=>p.type==='wheel'),a=members[0],source=original.find(p=>p.id==='m0');
  near(a.symmetryFrame,delta.clone().multiply(new T.Matrix4().fromArray(source.symmetryFrame)).toArray());
  const offset=new T.Vector3(1,0,0).transformDirection(delta),next=editSymmetryPose(moved,a.id,{position:new T.Vector3(...a.p).add(offset).toArray(),rotation:a.r});
  const second=members[1],actual=new T.Vector3(...next.find(p=>p.id===second.id).p).sub(new T.Vector3(...second.p));
  near(actual.toArray(),new T.Vector3(0,0,-1).transformDirection(delta).toArray());
 }
});
test('Corrupt axes and overlapping linked branches are rejected without modifying input',()=>{
 for(const mutate of [p=>p[1].symmetryFrame[0]=2,p=>p[1].symmetryFrame[3]=1,p=>p[1].symmetryFrame[12]=NaN,p=>delete p[1].symmetryGroup]){const p=fixture();mutate(p);assert.throws(()=>validateCraft({version:1,parts:p}));}
 const p=fixture();p.find(p=>p.id==='m1').parent='m0';const before=structuredClone(p);assert.throws(()=>editSymmetryPose(p,'m0',{position:[4,3,2],rotation:[0,0,0]}));assert.deepEqual(p,before);
});
