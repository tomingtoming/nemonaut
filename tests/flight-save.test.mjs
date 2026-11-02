import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
const roundtrip = f => loadFlight(JSON.parse(JSON.stringify(saveFlight(f))));
test('Orbit save resumes the same trajectory and fuel state', () => {
  const f = new Flight(preset('launcher'), 'orbit');
  f.stageNext();
  f.throttle = 0.2;
  f.sasMode = 'prograde';
  for (let i = 0; i < 600; i++) f.step(1 / 120);
  const g = roundtrip(f);
  for (let i = 0; i < 1200; i++) {
    f.step(1 / 120);
    g.step(1 / 120);
  }
  assert.ok(f.pos.distanceTo(g.pos) < 0.01);
  assert.ok(f.vel.distanceTo(g.vel) < 0.001);
  assert.ok(Math.abs(f.fuelRatio - g.fuelRatio) < 1e-10);
  assert.equal(g.sasMode, 'prograde');
  f.dispose();
  g.dispose();
});
test('Separated capsule and deployed parachute can be restored', () => {
  const f = new Flight(preset('returner'), 'drop');
  f.stageNext();
  f.stageNext();
  f.stageNext();
  f.armParachutes();
  for (let i = 0; i < 600; i++) f.step(1 / 120);
  const g = roundtrip(f);
  assert.equal(g.parts.length, 3);
  assert.deepEqual([...g.chutes], [...f.chutes]);
  for (let i = 0; i < 600; i++) {
    f.step(1 / 120);
    g.step(1 / 120);
  }
  assert.ok(f.pos.distanceTo(g.pos) < 0.02);
  f.dispose();
  g.dispose();
});
test('Malformed saves reject before constructing replacement physics', () => {
  const f = new Flight(preset('rocket'), 'orbit');
  f.step(1 / 120);
  const base = saveFlight(f);
  for (const mutate of [
    s => (s.pos[0] = Infinity),
    s => (s.q = [0, 0, 0, 0]),
    s => (s.fuel[0][1] = -1),
    s => (s.fuel = []),
    s => (s.active = ['missing']),
    s => (s.sasMode = 'invented'),
    s => (s.state.throttle = 3),
    s => (s.state.started = 'yes'),
    s => (s.version = 99)
  ]) {
    const s = structuredClone(base);
    mutate(s);
    assert.throws(() => loadFlight(s));
  }
  assert.equal(f.crashed, false);
  f.dispose();
});
test('Contact remains stable after landing and after restoring a landed save', () => {
  const f = new Flight(preset('recovery'), 'drop');
  f.armParachutes();
  for (let i = 0; i < 200 * 120 && !f.landed; i++) f.step(1 / 120);
  assert.ok(f.landed);
  const y = f.orbit.altitude,
    g = roundtrip(f);
  for (let i = 0; i < 60 * 120; i++) {
    f.step(1 / 120);
    g.step(1 / 120);
  }
  assert.ok(f.landed && g.landed);
  assert.ok(Math.abs(f.orbit.altitude - y) < 0.02);
  assert.ok(Math.abs(g.orbit.altitude - y) < 0.02);
  f.dispose();
  g.dispose();
});
