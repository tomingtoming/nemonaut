import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Flight, statistics, validateCraft} from '../dist/core.js';
import {preset, PARTS} from '../dist/catalog.js';
import {partCenter} from '../dist/aero.js';
import {bodyUp, bodyAltitude} from '../dist/celestial.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
test('Submarine sample keeps mass below full-displacement buoyancy center across ballast range', () => {
  const parts = validateCraft({version: 1, parts: preset('sub')}),
    cb = new T.Vector3();
  let volume = 0;
  for (const p of parts) {
    const d = PARTS[p.type],
      v = d.volume || d.size.reduce((a, b) => a * b, 1) * 0.18;
    cb.addScaledVector(partCenter(p), v);
    volume += v;
  }
  cb.divideScalar(volume);
  for (const ballast of [0, 0.25, 0.5, 0.75, 1]) {
    const st = statistics(parts, 1, ballast);
    assert.ok(cb.y > st.com.y + 0.03);
    assert.ok(Math.abs(cb.z - st.com.z) < 0.02);
  }
  assert.ok(statistics(parts, 1, 0).mass < volume * 1000);
  assert.ok(statistics(parts, 1, 1).mass > volume * 1000);
});
test('Submarine stays upright through hands-off surface, dive, saved restoration and resurfacing', () => {
  for (const time of [0, 192900]) {
    let f = new Flight(preset('sub'), 'water', time);
    f.sas = false;
    try {
      for (const [ballast, seconds] of [
        [0, 30],
        [1, 60],
        [0, 30]
      ]) {
        f.ballast = ballast;
        for (let i = 0; i < seconds * 120; i++) {
          f.step(1 / 120);
          const upright = new T.Vector3(0, 1, 0).applyQuaternion(f.q).dot(bodyUp(f.pos, f.universalTime));
          assert.ok(upright > 0.94, 'roll/pitch remains within 20 degrees without SAS');
        }
        assert.equal(f.crashed, false);
        if (ballast === 1) {
          assert.ok(bodyAltitude(f.pos, f.universalTime) < -5);
          const loaded = loadFlight(saveFlight(f));
          f.dispose();
          f = loaded;
        } else assert.ok(Math.abs(bodyAltitude(f.pos, f.universalTime)) < 0.5);
      }
    } finally {
      f.dispose();
    }
  }
});
