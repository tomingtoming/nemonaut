import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {PLANET, gravity, atmosphere, orbitState} from '../dist/planet.js';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
test('Planet gravity is central and atmosphere ends at 70 km', () => {
  assert.ok(Math.abs(gravity(new T.Vector3()).length() - 9.81) < 1e-10);
  assert.ok(gravity(new T.Vector3(600000, -600000, 0)).x < 0);
  assert.equal(atmosphere(70000).density, 0);
  assert.equal(atmosphere(80000).pressure, 0);
  assert.ok(Math.abs(atmosphere(0).density - 1.225) < 0.001);
  let last = Infinity;
  for (let h = 0; h <= 70000; h += 100) {
    const p = atmosphere(h).pressure;
    assert.ok(p <= last);
    last = p;
  }
});
test('Orbital elements distinguish circular, impact and escape trajectories', () => {
  const p = new T.Vector3(0, 80000, 0),
    v = Math.sqrt(PLANET.mu / 680000),
    o = orbitState(p, new T.Vector3(0, 0, v));
  assert.ok(o.stable);
  assert.ok(Math.abs(o.periapsis - 80000) < 1e-6);
  assert.ok(v > 2278 && v < 2280);
  assert.ok(!orbitState(p, new T.Vector3(0, 0, 1000)).stable);
  assert.equal(orbitState(p, new T.Vector3(0, 0, v * 1.5)).apoapsis, Infinity);
});
test('Full Flight coasts a complete orbit without thrust, fuel consumption or float32 drift', () => {
  const f = new Flight(preset('rocket'), 'orbit');
  f.step(1 / 120);
  const initial = f.orbit,
    period = initial.period;
  let maxError = 0,
    minY = 0;
  for (let t = 0; t < period; t += 0.25) {
    f.step(0.25);
    maxError = Math.max(maxError, Math.abs(f.orbit.altitude - 80000));
    minY = Math.min(minY, f.pos.y);
  }
  assert.ok(maxError < 1, `altitude drift ${maxError} m`);
  assert.ok(minY < -1200000);
  assert.ok(Math.abs(f.orbit.energy / initial.energy - 1) < 1e-7);
  assert.equal(f.fuelRatio, 1);
  assert.equal(f.crashed, false);
  assert.ok(f.orbit.stable);
  f.dispose();
});
