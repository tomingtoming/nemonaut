import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {bodyOrbitState} from '../dist/celestial.js';
import {PLANET, center} from '../dist/planet.js';
import {maneuverPreview} from '../dist/maneuver.js';
import {maneuverApproach} from '../dist/closest-approach.js';
const radius = 800000,
  speed = Math.sqrt(PLANET.mu / radius),
  p = center.clone().add(new T.Vector3(0, radius, 0)),
  v = new T.Vector3(0, 0, speed),
  axis = new T.Vector3(1, 0, 0),
  epoch = 100;
const target = bodyOrbitState(
  p.clone().sub(center).applyAxisAngle(axis, 0.2).add(center),
  v.clone().applyAxisAngle(axis, 0.2),
  epoch
);
test('Delayed zero burn compares identical trajectories over identical future window', () => {
  const preview = maneuverPreview(p, v, {universalTime: 400}, 0, epoch),
    before = target.r.clone(),
    result = maneuverApproach(preview, target);
  assert.equal(result.delay, 300);
  assert.equal(result.baseline.computedAt, 400);
  assert.equal(result.planned.computedAt, 400);
  assert.equal(result.baseline.horizon, result.planned.horizon);
  assert.ok(Math.abs(result.baseline.distance - 2 * radius * Math.sin(0.1)) < 0.02);
  assert.ok(Math.abs(result.baseline.distance - result.planned.distance) < 0.01);
  assert.deepEqual(target.r, before);
});
test('Phasing burn reduces separation while baseline retains circular separation', () => {
  const preview = maneuverPreview(p, v, 'now', -25, epoch),
    result = maneuverApproach(preview, target);
  assert.ok(result.planned.distance < result.baseline.distance * 0.5);
  assert.equal(result.baseline.horizon, result.planned.horizon);
  assert.throws(() => maneuverApproach({...preview, burnVel: null}, target));
  assert.throws(() => maneuverApproach(preview, {...target, universalTime: 101}));
  assert.throws(() => maneuverApproach(maneuverPreview(p, v, 'now', -500, epoch), target));
});
