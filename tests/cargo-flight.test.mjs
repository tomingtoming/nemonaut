import test from 'node:test';
import assert from 'node:assert/strict';
import {runCargoFlight} from '../tools/cargo-flight-profile.mjs';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
test('loaded cargo transport departs, lands gently, stops and restores the entire payload', () => {
  const result = runCargoFlight();
  let f = result.flight;
  try {
    assert.ok(result.peak > 300 && result.peak < 400);
    assert.ok(result.touch);
    assert.ok(result.touch.impact > -4 && result.touch.impact < 0);
    assert.ok(result.touch.speed > 80);
    assert.equal(f.crashed, false);
    assert.equal(f.landed, true);
    assert.equal(f.parts.length, 72);
    assert.equal(f.detached.length, 0);
    assert.equal(f.throttle, 0);
    assert.equal(f.brake, true);
    const bay = f.parts.find(p => p.type === 'cargoBay'),
      ring = f.parts.find(p => p.type === 'decoupler');
    assert.equal(ring.parent, bay.id);
    assert.equal(f.parts.filter(p => p.type === 'probe').length, 1);
    assert.equal(f.parts.filter(p => p.type === 'solar').length, 2);
    const pos = f.pos.clone(),
      fuel = f.fuelRatio,
      ids = f.parts.map(p => p.id),
      parents = f.parts.map(p => [p.id, p.parent]),
      time = f.universalTime;
    const restored = loadFlight(saveFlight(f));
    f.dispose();
    f = restored;
    assert.equal(f.universalTime, time);
    assert.ok(f.pos.distanceTo(pos) < 1e-5);
    assert.ok(Math.abs(f.fuelRatio - fuel) < 1e-8);
    assert.deepEqual(
      f.parts.map(p => p.id),
      ids
    );
    assert.deepEqual(
      f.parts.map(p => [p.id, p.parent]),
      parents
    );
    assert.equal(f.landed, true);
    assert.equal(f.crashed, false);
    assert.equal(f.throttle, 0);
    assert.equal(f.brake, true);
    for (let i = 0; i < 120; i++) f.step(1 / 120);
    assert.equal(f.landed, true);
    assert.equal(f.crashed, false);
    assert.ok(f.telemetry.surfaceSpeed < 0.8);
  } finally {
    f.dispose();
  }
});
