import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';

test('Swift lifts off a rotating runway using its elevator and preserves an airborne save', async () => {
  const {saveFlight, loadFlight} = await import('../dist/flight-save.js');
  for (const epoch of [0, 159542]) {
    const f = new Flight(preset('plane'), 'runway', epoch);
    let restored;
    try {
      f.throttle = 1;
      f.stageNext();
      for (let i = 0; i < 32 * 120; i++) f.step(1 / 120, {pitch: i > 10 * 120 ? -1 : 0});
      assert.equal(f.crashed, false);
      assert.ok(f.orbit.altitude > 50, 'normal ground departure must become airborne');
      assert.ok(f.orbit.vertical > 5, 'positive climb rate');
      assert.equal(f.telemetry.contacts, 0);
      assert.ok(f.fuelRatio < 1 && f.fuelRatio > 0.9);
      restored = loadFlight(saveFlight(f));
      assert.ok(restored.pos.distanceTo(f.pos) < 0.001);
      assert.ok(restored.vel.distanceTo(f.vel) < 0.001);
      assert.equal(restored.parts.length, 16);
      assert.equal(restored.crashed, false);
    } finally {
      f.dispose();
      restored?.dispose();
    }
  }
});
