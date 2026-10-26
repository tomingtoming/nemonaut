import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3,Quaternion} from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {setOrbitUp} from '../dist/camera-up.js';

test('OrbitControls uses the local vertical through body rotation and workshop return',()=>{
 const camera=new PerspectiveCamera(),controls=new OrbitControls(camera,null);
 controls.target.set(120,340,-210);
 const localOffset=new Vector3(12,8,16),worldUp=new Vector3(0,1,0);
 for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5,0]){
  const rotation=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),angle);
  const up=worldUp.clone().applyQuaternion(rotation);
  const offset=localOffset.clone().applyQuaternion(rotation);
  camera.position.copy(controls.target).add(offset);
  setOrbitUp(controls,up);controls.update();camera.updateMatrixWorld();
  assert.ok(camera.position.distanceTo(controls.target.clone().add(offset))<1e-8);
  assert.ok(Math.abs(controls.getPolarAngle()-Math.acos(localOffset.y/localOffset.length()))<1e-10);
  const screenUp=new Vector3(0,1,0).applyQuaternion(camera.quaternion);
  const forward=controls.target.clone().sub(camera.position).normalize();
  const expectedUp=up.clone().addScaledVector(forward,-up.dot(forward)).normalize();
  assert.ok(screenUp.dot(expectedUp)>1-1e-10,'local horizon has no camera roll');
 }
});
