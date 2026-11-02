import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {navDirections, attitudeTarget} from '../dist/navigation.js';
test('Navigation vectors remain well-defined near poles and at rest', () => {
  assert.equal(navDirections(new T.Vector3(), new T.Vector3()).prograde, null);
  for (const p of [new T.Vector3(), new T.Vector3(600000, -600000, 0)]) {
    const d = navDirections(p, new T.Vector3(0, 0, 2000));
    assert.ok(Math.abs(d.radial.dot(d.prograde)) < 1e-8);
    assert.ok(d.prograde.dot(d.retrograde) < -0.999);
    assert.ok(Math.abs(d.normal.length() - 1) < 1e-9);
  }
  const q = attitudeTarget(new T.Quaternion(), new T.Vector3(0, 1, 0), new T.Vector3(0, -1, 0));
  assert.ok(new T.Vector3(0, 1, 0).applyQuaternion(q).y < -0.999);
});
test('Retrograde SAS uses reaction torque to align, and a burn lowers periapsis', () => {
  const f = new Flight(preset('rocket'), 'orbit');
  f.sasMode = 'retrograde';
  for (let i = 0; i < 30 * 120; i++) f.step(1 / 120);
  const forward = new T.Vector3(0, 1, 0).applyQuaternion(f.q);
  assert.ok(forward.dot(f.vel.clone().normalize()) < -0.99);
  const before = f.orbit.periapsis;
  f.stageNext();
  f.throttle = 0.2;
  for (let i = 0; i < 10 * 120; i++) f.step(1 / 120);
  assert.ok(f.orbit.periapsis < before - 10000);
  f.dispose();
});
test('Direction mode cannot rotate a vacuum craft with its reaction wheels disabled', () => {
  const f = new Flight(preset('rocket'), 'orbit'),
    initial = f.q.clone();
  f.reactionEnabled = false;
  f.sasMode = 'retrograde';
  for (let i = 0; i < 600; i++) f.step(1 / 120);
  assert.ok(initial.angleTo(f.q) < 0.001);
  assert.ok(f.omega.length() < 1e-6);
  f.dispose();
});
test('Manual attitude input cancels directional tracking', () => {
  const f = new Flight(preset('rocket'), 'orbit');
  f.sasMode = 'prograde';
  f.step(1 / 120, {pitch: 1});
  assert.equal(f.sasMode, 'hold');
  f.dispose();
});

import {compassFrame, compassHeading, navFrame} from '../dist/navigation.js';
import {bodyState, MOON} from '../dist/celestial.js';
test('Compass uses celestial north and east on both bodies, with undefined poles and vertical heading', () => {
  for (const pos of [new T.Vector3(), bodyState(MOON, 100).position.add(new T.Vector3(0, MOON.radius, 0))]) {
    const f = compassFrame(pos, 100);
    assert.ok(f.north.distanceTo(new T.Vector3(1, 0, 0)) < 1e-8);
    assert.ok(f.east.distanceTo(new T.Vector3(0, 0, 1)) < 1e-8);
    for (const [v, h] of [
      [f.north, 0],
      [f.east, 90],
      [f.north.clone().negate(), 180],
      [f.east.clone().negate(), 270]
    ])
      assert.ok(Math.abs(compassHeading(v, pos, 100) - h) < 1e-8);
    assert.equal(compassHeading(new T.Vector3(0, 1, 0), pos, 100), null);
  }
  assert.equal(compassFrame(new T.Vector3(600000, -600000, 0)), null);
  for (const rocket of [true, false]) {
    const base = new T.Vector3(0, rocket ? 1 : 0, rocket ? 0 : 1),
      q = new T.Quaternion().setFromUnitVectors(base, new T.Vector3(0, 0, 1));
    assert.equal(compassHeading(navFrame(q, rocket).forward, new T.Vector3()), 90);
  }
});
