import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {projectDeliverySite} from '../dist/site-marker.js';
import {deliverySitePosition} from '../dist/delivery-sites.js';
import {PRIMARY,bodyState} from '../dist/celestial.js';
function cameraAt(position,target){const c=new T.PerspectiveCamera(60,16/9,.1,1e9);c.position.copy(position);c.lookAt(target);c.updateMatrixWorld(true);return c;}
test('Site marker follows rotating world coordinates and hides behind the camera or planet',()=>{
 for(const time of [0,10000,50000]){
  const ground=deliverySitePosition(time),center=bodyState(PRIMARY,time).position,up=ground.clone().sub(center).normalize(),point=ground.clone().addScaledVector(up,3);
  const c=cameraAt(ground.clone().addScaledVector(up,40),point);
  const marker=projectDeliverySite(c,time,1280,720);assert.ok(marker);assert.ok(Math.abs(marker.x-640)<.01&&Math.abs(marker.y-360)<.01);
  c.lookAt(c.position.clone().add(up));c.updateMatrixWorld(true);assert.equal(projectDeliverySite(c,time,1280,720),null);
  const opposite=cameraAt(center.clone().addScaledVector(up,-PRIMARY.radius-100),point);assert.equal(projectDeliverySite(opposite,time,1280,720),null);
 }
});
test('Off-screen and zero-sized views do not place a misleading marker',()=>{
 const point=deliverySitePosition(0),c=cameraAt(point.clone().add(new T.Vector3(0,40,0)),point.clone().add(new T.Vector3(1000,0,0)));
 assert.equal(projectDeliverySite(c,0,1280,720),null);assert.equal(projectDeliverySite(c,0,0,720),null);
});
