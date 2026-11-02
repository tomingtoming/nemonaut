import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {LaunchPilot} from '../dist/launch-pilot.js';
test('Pioneer Heavy launches from surface, stages, reaches orbit and coasts without consuming fuel', () => {
  const f = new Flight(preset('launcher'), 'land'),
    pilot = new LaunchPilot();
  for (let i = 0; i < 400 * 120 && !pilot.done && !f.crashed; i++) {
    pilot.update(f);
    f.step(1 / 120);
  }
  assert.ok(pilot.done);
  assert.ok(f.orbit.periapsis > 75000);
  assert.ok(f.orbit.apoapsis < 1000000);
  assert.equal(f.stage, 1);
  assert.equal(f.parts.length, 4);
  assert.equal(f.throttle, 0);
  assert.ok(f.fuelRatio > 0.1);
  const fuel = f.fuelRatio,
    energy = f.orbit.energy,
    period = f.orbit.period;
  for (let t = 0; t < period; t += 0.25) f.step(0.25);
  assert.ok(f.orbit.periapsis > 74000);
  assert.ok(Math.abs(f.orbit.energy / energy - 1) < 1e-6);
  assert.equal(f.fuelRatio, fuel);
  assert.equal(f.crashed, false);
  f.dispose();
});
