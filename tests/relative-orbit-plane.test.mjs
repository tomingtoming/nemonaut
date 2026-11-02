import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {bodyOrbitState} from '../dist/celestial.js';
import {center, PLANET} from '../dist/planet.js';
import {relativeOrbitPlane} from '../dist/relative-orbit-plane.js';
import {coastDrift} from '../dist/coast-orbit.js';
test('AN and DN lie on both planes, have correct crossing directions and future epochs', () => {
  const pos = center.clone().add(new T.Vector3(0, 680000, 0)),
    vel = new T.Vector3(0, 0, Math.sqrt(PLANET.mu / 680000)),
    o = bodyOrbitState(pos, vel, 100),
    target = bodyOrbitState(pos, vel.clone().applyAxisAngle(new T.Vector3(0, 1, 0), 0.2), 100),
    result = relativeOrbitPlane(o, target);
  assert.ok(Math.abs(result.inclination - (0.2 * 180) / Math.PI) < 1e-8);
  assert.equal(result.nodes.length, 2);
  assert.deepEqual(new Set(result.nodes.map(n => n.label)), new Set(['AN', 'DN']));
  for (const n of result.nodes) {
    const r = n.position.clone().sub(center);
    assert.ok(Math.abs(r.dot(o.normal)) < 1e-6);
    assert.ok(Math.abs(r.dot(target.normal)) < 1e-6);
    const state = coastDrift(pos, vel, 100, n.epoch - 100);
    assert.ok(state.position.distanceTo(n.position) < 0.01);
    assert.equal(state.velocity.dot(target.normal) > 0, n.label === 'AN');
  }
  assert.deepEqual(relativeOrbitPlane(o, o).nodes, []);
  assert.equal(relativeOrbitPlane(o, {...target, bodyId: 'moon'}), null);
});
