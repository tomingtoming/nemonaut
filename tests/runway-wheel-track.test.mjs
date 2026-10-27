import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {extendWheelTrack} from '../dist/runway-wheel-track.js';
import {runwayThreshold} from '../dist/runway-navigation.js';
import {launchSiteOrientation,surfaceOrientation} from '../dist/surface-frame.js';
test('wheel footprint includes axle edges and stays invariant under planet rotation',()=>{
 for(const time of [0,161700]){
  const q=surfaceOrientation(time).multiply(launchSiteOrientation('runway'));
  const base=runwayThreshold('09',time).add(new T.Vector3(8.5,0,100).applyQuaternion(q));
  const contact={point:base.toArray(),halfAxle:new T.Vector3(1,0,0).applyQuaternion(q).toArray(),time};
  const track=extendWheelTrack(null,[contact]);
  assert.ok(track.maxCross>9.49&&track.maxCross<9.51);assert.ok(track.minAlong>99.9&&track.maxAlong<100.1);
  assert.equal(track.samples,2);assert.deepEqual(extendWheelTrack(track,[]),track);
 }
 assert.equal(extendWheelTrack(null,[]),null);
});
