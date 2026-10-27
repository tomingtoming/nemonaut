import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {landingFixture} from '../tools/landing-profile.mjs';
import {landingTrim} from '../tools/landing-trim.mjs';
import {bodyUp,bodyGravity,bodyAltitude} from '../dist/celestial.js';
import {surfaceVelocity,surfaceAngularVelocity} from '../dist/surface-frame.js';
import {compassFrame} from '../dist/navigation.js';
import {controlDeflection} from '../dist/aero.js';
import {atmosphere} from '../dist/planet.js';
const rad=Math.PI/180;
for(const kind of ['plane','plane-large','transport-cargo'])test(`${kind} static trim agrees with the live force and moment calculation`,()=>{
 const f=landingFixture({kind,fuelLoad:.5,offset:0});
 try{
  const center=f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),up=bodyUp(center,f.universalTime),east=compassFrame(center,f.universalTime).east;
  const density=atmosphere(bodyAltitude(center,f.universalTime)).density,gravity=bodyGravity(center,f.universalTime).length();
  const trim=landingTrim(f,{speed:90,density,gravity});assert.ok(trim);
  assert.ok(Math.abs(trim.pitchCommand)<.8);assert.ok(Math.abs(trim.liftError)<1);assert.ok(Math.abs(trim.pitchTorque)<1);
  const pitch=(trim.alpha-3)*rad,forward=east.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(up,Math.sin(pitch)),right=up.clone().cross(east).normalize();
  f.q.setFromRotationMatrix(new T.Matrix4().makeBasis(right,forward.clone().cross(right).normalize(),forward));
  const inverse=f.q.clone().invert();f.pos.copy(center).sub(f.stats.com.clone().applyQuaternion(f.q));
  f.vel.copy(surfaceVelocity(center,f.universalTime)).addScaledVector(east,90*Math.cos(-3*rad)).addScaledVector(up,90*Math.sin(-3*rad));
  f.omega.copy(surfaceAngularVelocity());f.throttle=trim.throttle;f.sas=false;f.reactionEnabled=false;f.rcsEnabled=false;
  for(const p of f.parts)f.deflections.set(p.id,controlDeflection(p,f.stats.com,{pitch:trim.pitchCommand}));
  const weight=f.stats.mass*gravity;
  f.step(1/120,{pitch:trim.pitchCommand});
  assert.ok(Math.abs(f.telemetry.force.dot(up)-weight)<weight*.001,'vertical force must balance weight');
  assert.ok(Math.abs(f.telemetry.force.dot(east))<weight*.001,'horizontal force must balance at constant speed');
  assert.ok(Math.abs(f.telemetry.torque.clone().applyQuaternion(inverse).x)<weight*f.stats.aero.chord*.001,'pitch moment must be balanced');
 }finally{f.dispose();}
});
test('light cargo lift-only speed lacks trim reserve; adequate speed restores it',()=>{
 const f=landingFixture({kind:'transport-cargo',fuelLoad:.25});
 try{
  assert.equal(landingTrim(f,{speed:60}),null);
  assert.ok(landingTrim(f,{speed:70}));
  for(const p of f.parts)p.controlEnabled=false;
  assert.equal(landingTrim(f,{speed:70}),null);
 }finally{f.dispose();}
});
