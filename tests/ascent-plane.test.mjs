import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {ascentPlane, orbitInclination} from '../tools/ascent-plane.mjs';
test('target plane passes through launch position and has requested inclination across meridians', () => {
  for (const longitude of [0, Math.PI / 2, Math.PI, Math.PI * 1.5])
    for (const inclination of [0, 30, 90, 150, 180]) {
      const up = new T.Vector3(0, Math.cos(longitude), Math.sin(longitude)),
        n = ascentPlane(up, inclination),
        t = n.clone().cross(up);
      assert.ok(Math.abs(n.dot(up)) < 1e-12);
      assert.ok(Math.abs(n.length() - 1) < 1e-12);
      assert.ok(Math.abs(orbitInclination(up, t) - inclination) < 1e-6);
    }
});
test('off-equator launch rejects unreachable plane and retains requested reachable inclination', () => {
  const up = new T.Vector3(0.5, Math.sqrt(0.75), 0);
  assert.throws(() => ascentPlane(up, 0), /latitude/);
  const n = ascentPlane(up, 45);
  assert.ok(Math.abs(n.dot(up)) < 1e-12);
  assert.ok(Math.abs(orbitInclination(up, n.clone().cross(up)) - 45) < 1e-6);
  for (const i of [NaN, -1, 181]) assert.throws(() => ascentPlane(up, i));
  assert.equal(orbitInclination(up, up), null);
});
