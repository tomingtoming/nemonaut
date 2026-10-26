import test from 'node:test';import assert from 'node:assert/strict';
import * as T from 'three';import {Flight} from '../dist/core.js';import {preset} from '../dist/catalog.js';import {bodyOrbitState} from '../dist/celestial.js';import {centerOfVessel,relativeState,setTarget} from '../dist/relative-navigation.js';import {relativeStopPlan} from '../dist/relative-stop-plan.js';import {maneuverPreview} from '../dist/maneuver.js';import {createManeuverNode,maneuverDirection} from '../dist/maneuver-node.js';
test('Large vessel correction with relative alignment and shorter burns keeps residual below 1.5 m/s',()=>{
const f=new Flight(preset('lunar-surface-expedition'),'orbit');f.stageNext();f.stageNext();const g=f.detached[0];f.vel.z+=80;setTarget(f,f,g);
function plan(){const p=relativeStopPlan(bodyOrbitState(centerOfVessel(f),f.vel,f.universalTime),bodyOrbitState(centerOfVessel(g),g.vel,g.universalTime),'now');f.maneuver=createManeuverNode(maneuverPreview(centerOfVessel(f),f.vel,p.location,p.components,f.universalTime),f.time);f.maneuver.stopAtTarget=true;f.sasMode='maneuver';return p;}
try{
 let previous=relativeState(f,g).speed;
 for(let cycle=0;cycle<2;cycle++){
  f.throttle=0;f.sasMode='relativeRetrograde';
  for(let steps=0;steps<180*120;steps++){
   f.step(1/120);
   if(new T.Vector3(0,1,0).applyQuaternion(f.q).angleTo(relativeState(f,g).braking)<.01&&f.omega.length()<.01)break;
  }
  plan();
  assert.ok(new T.Vector3(0,1,0).applyQuaternion(f.q).angleTo(maneuverDirection(f.maneuver))<.011);
  f.throttle=1;let burn=0;
  for(;burn<150*120&&!f.maneuver.complete;burn++){
   f.throttle=Math.hypot(...f.maneuver.remaining)<2?.1:1;f.step(1/120);
  }
  assert.equal(f.maneuver.complete,true);assert.equal(f.throttle,0);
  const result=relativeState(f,g);
  assert.ok(result.speed<previous,'each correction must reduce the residual');previous=result.speed;
  assert.ok(result.distance>10000);assert.ok(burn/120<10);
  if(result.speed<.5)break;
 }
 // The first finite burn leaves gravity/attitude error; the second plan corrects it.
 assert.ok(relativeState(f,g).speed<1.5);
}finally{f.dispose();}

});
