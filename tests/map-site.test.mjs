import test from 'node:test';
import assert from 'node:assert/strict';
import {deliveryMapView} from '../dist/map-site.js';
import {deliverySitePosition} from '../dist/delivery-sites.js';
import {PRIMARY, bodyState} from '../dist/celestial.js';
import {projectTrackingPoint} from '../dist/tracking-orbits.js';
test('Map focus brings the rotating surface destination to the front centre', () => {
  for (const time of [0, 5000, 10000, 21600, 200000]) {
    const {yaw, pitch} = deliveryMapView(time),
      point = deliverySitePosition(time).sub(bodyState(PRIMARY, time).position);
    const [x, y, z] = projectTrackingPoint(point.toArray(), yaw, pitch);
    assert.ok(Math.abs(x) < 1e-5 && Math.abs(y) < 1e-5);
    assert.ok(Math.abs(z - PRIMARY.radius) < 1e-5);
    const opposite = projectTrackingPoint(point.negate().toArray(), yaw, pitch);
    assert.ok(opposite[2] < 0);
  }
});
