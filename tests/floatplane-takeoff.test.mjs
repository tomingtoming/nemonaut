import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';
import {preset, part} from '../dist/catalog.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import {bodyAltitude} from '../dist/celestial.js';

const design = fuelLoad => {
  const parts = preset('plane').filter(p => !['nosegear', 'maingear'].includes(p.type));
  parts.find(p => p.type === 'jet').p[1] = 0.8;
  parts.find(p => p.type === 'tank').fuelLoad = fuelLoad;
  for (const p of parts) if (p.type === 'wing') p.r[0] = Math.PI / 2 - Math.PI / 18;
  for (const x of [-1.4, 1.4])
    for (const z of [-1.2, 2]) {
      const float = part('pontoon', [x, -0.3, z], [Math.PI / 2, 0, 0]);
      float.parent = parts[1].id;
      parts.push(float);
    }
  return parts;
};

for (const epoch of [0, 5000])
  test(`a light floatplane takes off and resumes its airborne save at epoch ${epoch}`, () => {
    const original = new Flight(design(0.25), 'water', epoch);
    let restored;
    try {
      original.stageNext();
      original.throttle = 1;
      for (let i = 0; i < 7200; i++) original.step(1 / 120, {pitch: i > 1200 ? -1 : 0});
      assert.equal(original.failureEvents.length, 0);
      assert.equal(original.parts.length, 17);
      assert.ok(original.orbit.altitude > 500, 'must climb clear of the sea, not merely bounce');
      assert.ok(original.orbit.vertical > 5);
      assert.equal(original.telemetry.groundContact, false);
      restored = loadFlight(saveFlight(original));
      assert.ok(restored.pos.distanceTo(original.pos) < 0.001);
      assert.deepEqual([...restored.fuel], [...original.fuel]);
      for (let i = 0; i < 600; i++) restored.step(1 / 120, {pitch: -1});
      assert.equal(restored.failureEvents.length, 0);
      assert.equal(restored.parts.length, 17);
      assert.ok(restored.orbit.altitude > original.orbit.altitude);
      assert.ok(restored.fuelRatio < original.fuelRatio);
    } finally {
      restored?.dispose();
      original.dispose();
    }
  });

test('the same wing incidence does not make the full-fuel floatplane take off', () => {
  const f = new Flight(design(1), 'water');
  try {
    f.stageNext();
    f.throttle = 1;
    for (let i = 0; i < 7200; i++) f.step(1 / 120, {pitch: i > 1200 ? -1 : 0});
    assert.equal(f.failureEvents.length, 0);
    // Match the taxi measurement at the design origin, not the elevated center of mass used by orbit.
    assert.ok(Math.abs(bodyAltitude(f.pos, f.universalTime)) < 1, 'the heavier configuration remains afloat');
  } finally {
    f.dispose();
  }
});
