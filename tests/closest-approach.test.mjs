import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {bodyOrbitState} from '../dist/celestial.js';
import {PLANET, center} from '../dist/planet.js';
import {closestApproach} from '../dist/closest-approach.js';
const r = 680000,
  s = Math.sqrt(PLANET.mu / r),
  p = center.clone().add(new T.Vector3(0, r, 0)),
  v = new T.Vector3(0, 0, s),
  axis = new T.Vector3(1, 0, 0);
test('Simultaneous encounter search finds analytic counter-rotating intersection', () => {
  const angle = 0.6,
    a = bodyOrbitState(p, v, 100),
    b = bodyOrbitState(
      p.clone().sub(center).applyAxisAngle(axis, angle).add(center),
      v.clone().applyAxisAngle(axis, angle).negate(),
      100
    ),
    before = a.r.clone(),
    result = closestApproach(a, b);
  assert.ok(result.distance < 0.1);
  assert.ok(Math.abs(result.time - (angle * r) / (2 * s)) < 0.01);
  assert.ok(Math.abs(result.speed - 2 * s) < 0.01);
  assert.ok(result.own.distanceTo(result.target) < 0.1);
  assert.deepEqual(a.r, before);
});
test('Equal circular motion keeps separation and incompatible predictions reject', () => {
  const a = bodyOrbitState(p, v, 100),
    b = bodyOrbitState(
      p.clone().sub(center).applyAxisAngle(axis, 0.2).add(center),
      v.clone().applyAxisAngle(axis, 0.2),
      100
    );
  assert.ok(Math.abs(closestApproach(a, b).distance - 2 * r * Math.sin(0.1)) < 0.01);
  assert.throws(() => closestApproach(a, {...b, bodyId: 'moon'}));
  assert.throws(() => closestApproach(a, {...b, periapsis: 0}));
  assert.throws(() => closestApproach(a, {...b, universalTime: 101}));
});
