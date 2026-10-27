import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {part} from '../dist/catalog.js';
import {createBodyAerodynamics,bodyDrag} from '../dist/body-drag.js';
const y=new T.Vector3(0,1,0),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('Body drag uses dimensions and incidence, not attached part count',()=>{
 const tank=part('tank'),m=createBodyAerodynamics([tank]);near(m.dragArea(y),.4*1.25*1.25);near(m.dragArea(new T.Vector3(1,0,0)),.4*1.25*2);
 const aligned=createBodyAerodynamics([tank,part('tank',[0,-2,0])]);near(aligned.dragArea(y),m.dragArea(y));
 const side=createBodyAerodynamics([tank,part('tank',[2,0,0])]);near(side.dragArea(y),2*m.dragArea(y));
});
test('Partial shielding, internal payloads and wing exclusion preserve exposed area',()=>{
 const a=part('truss'),b=part('truss',[.5,-1,0]);near(createBodyAerodynamics([a,b]).dragArea(y),.6);
 near(createBodyAerodynamics([a,part('rcs')]).dragArea(y),.4);
 near(createBodyAerodynamics([a,part('wing',[3,0,0])]).dragArea(y),.4);
});
test('Shield orientation and rigid transforms change drag consistently',()=>{
 const shield=part('heatShield'),model=createBodyAerodynamics([shield]);near(model.dragArea(y),Math.PI*1.1);near(model.dragArea(new T.Vector3(1,0,0)),2*.28*.4);
 const q=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),.7),v=new T.Vector3(0,100,0);
 const a=bodyDrag(model,new T.Quaternion(),v,1),b=bodyDrag(model,q,v.clone().applyQuaternion(q),1);
 near(a.force.length(),b.force.length());assert.ok(b.force.dot(v.clone().applyQuaternion(q))<0);
 near(bodyDrag(model,q,v,0).force.length(),0);near(bodyDrag(model,q,new T.Vector3(),1).force.length(),0);
});

test('scaled nose geometry inherits front drag treatment without streamlining its blunt back',()=>{
 const base=createBodyAerodynamics([part('nose')]),large=createBodyAerodynamics([part('transportTail')]);
 const forward=new T.Vector3(0,1,0),backward=new T.Vector3(0,-1,0),side=new T.Vector3(1,0,0);
 for(const direction of [forward,backward,side])near(large.dragArea(direction),base.dragArea(direction)*4.8**2);
 assert.ok(large.dragArea(forward)<large.dragArea(backward));
});
