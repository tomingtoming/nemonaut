import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {PRIMARY} from '../dist/celestial.js';
import {
  fixedToInertial,
  launchSiteOrientation,
  surfaceOrientation,
  surfaceVelocity
} from '../dist/surface-frame.js';
import {runwayApproach} from '../dist/runway-navigation.js';
import {runwayMapLayout} from '../dist/runway-map.js';

test('runway track removes planetary rotation and follows actual approach-coordinate change', () => {
  for (const time of [0, 161465.1])
    for (const end of ['09', '27']) {
      const point = fixedToInertial(
        new T.Vector3(2000, PRIMARY.radius + 500, 6000).applyQuaternion(launchSiteOrientation('runway')),
        time
      );
      const ground = surfaceVelocity(point, time);
      assert.equal(runwayApproach(point, time, end, ground).track, null);
      for (const local of [new T.Vector3(0, 0, 100), new T.Vector3(100, 0, 0), new T.Vector3(0, 100, 0)]) {
        const velocity = local
          .clone()
          .applyQuaternion(launchSiteOrientation('runway'))
          .applyQuaternion(surfaceOrientation(time))
          .add(ground);
        const a = runwayApproach(point, time, end, velocity),
          dt = 0.001;
        const b = runwayApproach(point.clone().addScaledVector(velocity, dt), time + dt, end);
        assert.ok(Math.abs(a.track.x - (b.crossTrack - a.crossTrack) / dt) < 0.01);
        assert.ok(Math.abs(a.track.y - (b.remaining - a.remaining) / dt) < 0.01);
      }
    }
});
test('runway map keeps aircraft and strip visible before and after the threshold on either side', () => {
  for (const crossTrack of [-20000, 0, 20000])
    for (const remaining of [-15000, 0, 15000]) {
      const m = runwayMapLayout({crossTrack, remaining, track: {x: 0, y: -100}});
      for (const p of [m.plane, m.threshold, m.far]) {
        assert.ok(p.x >= 24 - 1e-9 && p.x <= 216 + 1e-9);
        assert.ok(p.y >= 24 - 1e-9 && p.y <= 136 + 1e-9);
      }
      assert.ok(m.far.y < m.threshold.y);
      assert.ok(m.arrow.y < 0);
      assert.equal(m.arrow.x, 0);
      assert.equal(Math.sign(m.plane.x - m.threshold.x), Math.sign(crossTrack));
    }
  assert.equal(runwayMapLayout({crossTrack: 0, remaining: 0, track: null}).arrow, null);
});
