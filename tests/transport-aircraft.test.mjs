import test from 'node:test';
import assert from 'node:assert/strict';
import {PARTS, preset, nodes} from '../dist/catalog.js';
import {Flight, statistics, validateCraft} from '../dist/core.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';

test('modular six-engine transport retains independent wings, gear and a connected fuel network', () => {
  const craft = preset('transport');
  assert.deepEqual(validateCraft({version: 1, parts: craft}), craft);
  assert.equal(craft.filter(p => PARTS[p.type].air).length, 6);
  assert.equal(craft.filter(p => PARTS[p.type].wheel).length, 32);
  assert.equal(craft.filter(p => PARTS[p.type].steer).length, 4);
  assert.equal(craft.filter(p => p.type === 'transportFuselage').length, 3);
  assert.deepEqual(nodes('transportWingRoot'), [
    [0, 0, 0, -1, 0, 0],
    [14, 0, 0, 1, 0, 0]
  ]);
  assert.ok(statistics(craft).mass > 200000);
  for (const p of craft) if (p.parent) assert.ok(craft.some(parent => parent.id === p.parent));
});
test('six-engine transport taxis, takes off and preserves all engines and wheels through airborne save', () => {
  for (const epoch of [0, 161149.5]) {
    let f = new Flight(preset('transport'), 'runway', epoch);
    f.stageNext();
    f.throttle = 1;
    try {
      for (let i = 0; i < 120 * 120; i++) {
        const t = i / 120;
        f.step(1 / 120, {pitch: t > 15 && t < 45 ? -1 : 0});
        assert.equal(f.crashed, false);
        if (i === 10 * 120) assert.equal(f.telemetry.contacts, 32);
      }
      assert.ok(f.orbit.altitude > 400);
      assert.ok(f.orbit.vertical > 5);
      assert.equal(f.telemetry.contacts, 0);
      const engines = f.parts.filter(p => PARTS[p.type].air);
      assert.ok(engines.every(p => f.engineThrust.get(p.id) > 0));
      assert.ok(f.fuelRatio < 0.99 && f.fuelRatio > 0.8);
      const count = f.parts.length,
        pos = f.pos.clone(),
        fuel = f.fuelRatio;
      const restored = loadFlight(saveFlight(f));
      f.dispose();
      f = restored;
      assert.equal(f.parts.length, count);
      assert.ok(f.pos.distanceTo(pos) < 1e-5);
      assert.ok(Math.abs(f.fuelRatio - fuel) < 1e-8);
      for (let i = 0; i < 120; i++) f.step(1 / 120);
      assert.equal(f.crashed, false);
      assert.ok(f.orbit.vertical > 0);
    } finally {
      f.dispose();
    }
  }
});
