import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {orbitByArrows,ARROW_ORBIT} from '../dist/camera-up.js';

const rig=(up=new T.Vector3(0,1,0))=>({object:{position:new T.Vector3(10,0,0),up:up.clone()},target:new T.Vector3(0,0,0),minPolarAngle:0,maxPolarAngle:Math.PI});
const polar=c=>c.object.position.clone().sub(c.target).angleTo(c.object.up);
test('no arrow held leaves the camera where it is',()=>{
 const c=rig();assert.equal(orbitByArrows(c,new Set(),1/60),false);assert.deepEqual(c.object.position.toArray(),[10,0,0]);
 assert.equal(orbitByArrows(c,new Set(['ArrowLeft']),0),false,'zero dt (first frame) does not move');
});
test('left/right turn around the vertical at the stated rate and keep distance and height',()=>{
 const c=rig();orbitByArrows(c,new Set(['ArrowLeft']),1);
 const turned=c.object.position.clone().setY(0).angleTo(new T.Vector3(10,0,0));
 assert.ok(Math.abs(turned-ARROW_ORBIT.azimuthRate)<1e-9);assert.ok(Math.abs(c.object.position.length()-10)<1e-9);assert.ok(Math.abs(c.object.position.y)<1e-9);
 const d=rig();orbitByArrows(d,new Set(['ArrowRight']),.5);assert.ok(d.object.position.z*c.object.position.z<0,'right turns the other way');
 const both=rig();assert.equal(orbitByArrows(both,new Set(['ArrowLeft','ArrowRight']),1),false,'opposite keys cancel');
});
test('up raises the camera to look down, down lowers it, and neither crosses a pole',()=>{
 const c=rig();orbitByArrows(c,new Set(['ArrowUp']),.5);
 assert.ok(c.object.position.y>0&&Math.abs(polar(c)-(Math.PI/2-ARROW_ORBIT.polarRate*.5))<1e-9);assert.ok(Math.abs(c.object.position.length()-10)<1e-9);
 for(let i=0;i<600;i++)orbitByArrows(c,new Set(['ArrowUp']),1/60);
 assert.ok(polar(c)>0&&polar(c)<.01,'stops just short of straight overhead');assert.ok(c.object.position.x>0,'did not flip over the pole');
 const d=rig();d.maxPolarAngle=2;for(let i=0;i<600;i++)orbitByArrows(d,new Set(['ArrowDown']),1/60);
 assert.ok(Math.abs(polar(d)-2)<1e-9,'respects the controls polar limit');
});
test('the turn axis is the local vertical, e.g. a tilted planet surface up',()=>{
 const up=new T.Vector3(1,1,0).normalize(),c=rig(up);c.object.position.set(0,0,10);
 const before=polar(c);orbitByArrows(c,new Set(['ArrowRight']),.3);
 assert.ok(Math.abs(polar(c)-before)<1e-9,'turning keeps the angle to the local vertical');assert.ok(Math.abs(c.object.position.length()-10)<1e-9);
});
