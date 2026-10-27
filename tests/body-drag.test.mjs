import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {part} from '../dist/catalog.js';
import {createBodyAerodynamics,bodyDrag,MIN_BODY_DRAG_FORCE} from '../dist/body-drag.js';
const y=new T.Vector3(0,1,0),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('near-rest shortcut bounds omitted force while resolving meaningful low-speed drag',()=>{
 const model=createBodyAerodynamics([part('tank'),part('heatShield',[0,-2,0])]),q=new T.Quaternion();
 for(const direction of [y,new T.Vector3(1,0,0),new T.Vector3(1,2,3).normalize()])assert.ok(model.dragArea(direction)<=model.maxCdArea);
 const exact=model.dragArea.bind(model);let calls=0;model.dragArea=v=>{calls++;return exact(v);};
 const speed=Math.sqrt(MIN_BODY_DRAG_FORCE/(2*model.maxCdArea)),v=y.clone().multiplyScalar(speed);
 assert.ok(.5*v.lengthSq()*exact(v)<MIN_BODY_DRAG_FORCE);
 assert.equal(bodyDrag(model,q,v,1).force.length(),0);assert.equal(calls,0);
 const faster=v.clone().multiplyScalar(10),expected=.5*faster.lengthSq()*exact(faster);
 near(bodyDrag(model,q,faster,1).force.length(),expected);assert.equal(calls,1);
 // Density matters: a fixed speed threshold would incorrectly skip this case.
 assert.ok(bodyDrag(model,q,v,100).force.length()>0);assert.equal(calls,2);
});
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
