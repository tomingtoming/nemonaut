import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {PLANET, center} from '../dist/planet.js';
import {orbitSegments, projectTrackingPoint} from '../dist/tracking-orbits.js';
import {launchIntoFleet} from '../dist/launch-fleet.js';
import {preset} from '../dist/catalog.js';
import {saveFlight} from '../dist/flight-save.js';
import {trackingList} from '../dist/tracking.js';
const radius = 680000,
  speed = Math.sqrt(PLANET.mu / radius),
  pos = center.clone().add(new T.Vector3(0, radius, 0));
test('Circular tracks preserve radius and differently inclined orbital planes in common coordinates', () => {
  const yz = orbitSegments(pos, new T.Vector3(0, 0, speed)),
    xy = orbitSegments(pos, new T.Vector3(speed, 0, 0));
  assert.equal(yz.length, 720);
  assert.equal(xy.length, 720);
  for (const p of yz.flat()) {
    assert.ok(Math.abs(Math.hypot(...p) - radius) < 1e-6);
    assert.ok(Math.abs(p[0]) < 1e-6);
  }
  for (const p of xy.flat()) assert.ok(Math.abs(p[2]) < 1e-6);
  assert.ok(Math.max(...xy.flat().map(p => Math.abs(p[0]))) > 679000);
});
test('Impact trajectories never draw segments through the solid planet; escape tracks are finite', () => {
  const segments = orbitSegments(pos, new T.Vector3(0, 0, speed * 0.8));
  assert.ok(segments.length > 0 && segments.length < 720);
  for (const [a, b] of segments) {
    const start = new T.Vector3(...a),
      d = new T.Vector3(...b).sub(start),
      t = T.MathUtils.clamp(-start.dot(d) / d.lengthSq(), 0, 1);
    assert.ok(start.addScaledVector(d, t).length() >= PLANET.radius);
  }
  const escape = orbitSegments(pos, new T.Vector3(0, 0, speed * 1.6));
  assert.ok(escape.length > 0);
  for (const p of escape.flat()) {
    assert.ok(p.every(Number.isFinite));
    assert.ok(Math.hypot(...p) <= 12 * PLANET.radius);
  }
  assert.deepEqual(orbitSegments(pos, new T.Vector3()), []);
  assert.deepEqual(orbitSegments(pos, new T.Vector3(0, 0, speed), {stopped: true}), []);
});
test('View rotation preserves distance, and fleet map extraction does not change the stored world', () => {
  const point = [100, 200, 300];
  assert.deepEqual(projectTrackingPoint(point, 0, 0), point);
  assert.ok(Math.abs(Math.hypot(...projectTrackingPoint(point, 0.7, 0.4)) - Math.hypot(...point)) < 1e-9);
  const a = launchIntoFleet(null, {parts: preset('rocket'), name: 'A', environment: 'orbit'}),
    b = launchIntoFleet(saveFlight(a), {parts: preset('rocket'), name: 'B', environment: 'orbit'});
  a.dispose();
  b.vel.set(speed, 0, 0);
  b.orbit = null;
  const record = saveFlight(b),
    before = structuredClone(record),
    rows = trackingList(record, {includeOrbit: true});
  assert.equal(rows.length, 2);
  assert.ok(rows.every(r => r.position.every(Number.isFinite) && r.segments.length > 0));
  assert.deepEqual(record, before);
  assert.deepEqual(trackingList(null, {includeOrbit: true}), []);
  b.dispose();
});
