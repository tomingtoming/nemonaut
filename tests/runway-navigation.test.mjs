import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {runwayThreshold,runwayApproach,RUNWAY} from '../dist/runway-navigation.js';
import {PRIMARY,MOON,bodyState} from '../dist/celestial.js';import {fixedToInertial,launchSiteOrientation} from '../dist/surface-frame.js';
const point=(x,z,t)=>fixedToInertial(new T.Vector3(x,PRIMARY.radius,z).normalize().multiplyScalar(PRIMARY.radius+300).applyQuaternion(launchSiteOrientation('runway')),t);
test('runway approach rotates with the planet and reverses cross-track for opposite landing directions',()=>{
 for(const t of [0,159776,21549]){
  for(const end of ['09','27']){const on=runwayApproach(runwayThreshold(end,t),t,end);assert.ok(on.distance<.02);assert.equal(on.bearing,null);assert.ok(Math.abs(on.crossTrack)<.01);assert.ok(Math.abs(on.remaining)<.01);}
  const west=runwayApproach(point(100,-3150,t),t,'09');assert.ok(Math.abs(west.remaining-3000)<.1);assert.ok(Math.abs(west.crossTrack+100)<.1);assert.ok(west.bearing>85&&west.bearing<95);
  const east=runwayApproach(point(100,4450,t),t,'27');assert.ok(Math.abs(east.remaining-3000)<.2);assert.ok(Math.abs(east.crossTrack-100)<.1);assert.ok(east.bearing>265&&east.bearing<275);
  assert.ok(runwayApproach(point(0,0,t),t,'09').remaining<0);
 }
 assert.equal(RUNWAY.length,1600);
 assert.equal(runwayApproach(bodyState(MOON,0).position.clone().add(new T.Vector3(MOON.radius+100,0,0)),0),null);
});
