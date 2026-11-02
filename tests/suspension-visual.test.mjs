import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';
import {preset, PARTS} from '../dist/catalog.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import {partCenter} from '../dist/aero.js';
import {bodyAltitude} from '../dist/celestial.js';
import {soundState} from '../dist/game-audio.js';
test('wheel extension follows real clearance, survives saves and rolling audio requires contact', () => {
  const f = new Flight(preset('rover'), 'land');
  let restored;
  try {
    for (let i = 0; i < 600; i++) f.step(1 / 120);
    for (const p of f.parts.filter(p => PARTS[p.type].wheel)) {
      const state = f.wheelMotion.get(p.id),
        height =
          bodyAltitude(partCenter(p).applyQuaternion(f.q).add(f.pos), f.universalTime) -
          PARTS[p.type].size[1] / 2;
      assert.ok(state.extension > 0 && state.extension < 0.18);
      assert.ok(Math.abs(height - state.extension) < 0.005);
    }
    restored = loadFlight(saveFlight(f));
    assert.deepEqual([...restored.wheelMotion], [...f.wheelMotion]);
    const bad = saveFlight(f);
    bad.wheelMotion[0][1].extension = 1;
    assert.throws(() => loadFlight(bad));
    f.stageNext();
    f.brake = false;
    for (let i = 0; i < 240; i++) f.step(1 / 120, {drive: 1});
    assert.ok(soundState(f).rolling > 0);
    assert.equal(soundState(f, false, true).rolling, 0);
    f.telemetry.contacts = 0;
    assert.equal(soundState(f).rolling, 0);
  } finally {
    restored?.dispose();
    f.dispose();
  }
});
