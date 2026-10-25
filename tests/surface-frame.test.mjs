import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {PRIMARY,MOON,bodyState} from '../dist/celestial.js';
import {PRIMARY_ROTATION_PERIOD as PERIOD,PRIMARY_ROTATION_RATE as RATE,surfaceAngularVelocity,surfaceOrientation,fixedToInertial,inertialToFixed,surfaceVelocity,surfaceRelativeVelocity,rotatingFrameCorrection} from '../dist/surface-frame.js';

test('rotating launch meridian and atmosphere have the derivative of their inertial position',()=>{
 for(const time of [0,PERIOD/4,123456.7])for(const altitude of [0,45000,70000]){
  const fixed=new T.Vector3(0,PRIMARY.radius+altitude,0),p=fixedToInertial(fixed,time),dt=.01;
  const derivative=fixedToInertial(fixed,time+dt).sub(fixedToInertial(fixed,time-dt)).divideScalar(2*dt);
  assert.ok(derivative.distanceTo(surfaceVelocity(p,time))<1e-5);
  assert.ok(inertialToFixed(p,time).distanceTo(fixed)<1e-8);
  assert.ok(surfaceRelativeVelocity(p,surfaceVelocity(p,time),time).length()<1e-10);
 }
 const launch=fixedToInertial(new T.Vector3(0,PRIMARY.radius,0));
 assert.ok(Math.abs(surfaceVelocity(launch).z-174.942)<.001);
 const pole=fixedToInertial(new T.Vector3(PRIMARY.radius,0,0));assert.equal(surfaceVelocity(pole).length(),0);
 const latitude=Math.PI/3,point=fixedToInertial(new T.Vector3(PRIMARY.radius*Math.sin(latitude),PRIMARY.radius*Math.cos(latitude),0));assert.ok(Math.abs(surfaceVelocity(point).length()-RATE*PRIMARY.radius*.5)<1e-10);
});

test('co-rotating rigid craft has no pointwise airflow or wheel speed',()=>{
 const time=4000,orientation=surfaceOrientation(time),com=fixedToInertial(new T.Vector3(0,PRIMARY.radius+5,0),time),velocity=surfaceVelocity(com,time),omega=surfaceAngularVelocity();
 for(const local of [new T.Vector3(2,0,0),new T.Vector3(0,-3,4),new T.Vector3(-5,12,-8)]){
  const arm=local.applyQuaternion(orientation),point=com.clone().add(arm),pointVelocity=velocity.clone().add(omega.clone().cross(arm));
  assert.ok(surfaceRelativeVelocity(point,pointVelocity,time).length()<1e-10);
 }
 const before=[com.toArray(),velocity.toArray()];rotatingFrameCorrection(com,velocity,time);assert.deepEqual([com.toArray(),velocity.toArray()],before);
});

test('centrifugal and Coriolis corrections balance rotating-frame acceleration',()=>{
 const p=fixedToInertial(new T.Vector3(0,PRIMARY.radius,0)),stationary=rotatingFrameCorrection(p,new T.Vector3());
 assert.ok(Math.abs(stationary.y-RATE**2*PRIMARY.radius)<1e-12);
 const east=new T.Vector3(0,0,100),correction=rotatingFrameCorrection(p,east);
 assert.ok(Math.abs(correction.y-stationary.y-2*RATE*100)<1e-12);
 assert.ok(correction.x===0&&correction.z===0);
});

test('moon translation remains independent of primary rotation',()=>{
 const time=25000,fixed=new T.Vector3(0,MOON.radius+20,0),p=fixedToInertial(fixed,time,MOON),state=bodyState(MOON,time);
 assert.ok(inertialToFixed(p,time,MOON).distanceTo(fixed)<1e-8);
 assert.ok(surfaceVelocity(p,time,MOON).distanceTo(state.velocity)<1e-10);
 assert.equal(surfaceRelativeVelocity(p,state.velocity,time,MOON).length(),0);
 assert.equal(rotatingFrameCorrection(p,new T.Vector3(50,10,30),time,MOON).length(),0);
});
