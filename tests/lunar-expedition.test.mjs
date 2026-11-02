import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {LaunchPilot} from '../dist/launch-pilot.js';
import {captureBurnEstimate} from '../dist/lunar-capture.js';

test('Lunar expedition launches from the surface with its return hardware and maneuver reserve intact', () => {
  const f = new Flight(preset('lunar-expedition'), 'land'),
    pilot = new LaunchPilot();
  try {
    const capsule = f.parts.find(p => p.type === 'capsule'),
      shield = f.parts.find(p => p.type === 'heatShield'),
      chute = f.parts.find(p => p.type === 'parachute');
    for (let i = 0; i < 600 * 120 && !pilot.done && !f.crashed; i++) {
      pilot.update(f);
      f.step(1 / 120);
    }
    assert.ok(pilot.done);
    assert.equal(f.crashed, false);
    assert.ok(f.orbit.periapsis > 75000);
    assert.ok(f.orbit.energy < 0);
    assert.equal(f.stage, 2);
    assert.equal(f.parts.length, 8);
    assert.equal(f.detached.length, 2);
    assert.equal(f.throttle, 0);
    for (const p of [capsule, shield, chute]) assert.ok(f.parts.some(q => q.id === p.id));
    assert.equal(f.thermal.get(shield.id).ablator, 40);
    assert.equal(f.chutes.get(chute.id).status, 'stowed');
    const reserve = captureBurnEstimate(f, 1600);
    assert.ok(reserve.enough);
    assert.ok(reserve.fuelRemaining > 0);
    const fuel = new Map(f.fuel);
    for (let i = 0; i < 120; i++) f.step(0.25);
    assert.deepEqual(f.fuel, fuel);
    assert.ok(f.orbit.periapsis > 74000);
  } finally {
    f.dispose();
  }
});
