import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';
import {preset, PARTS} from '../dist/catalog.js';
import {engineMedium} from '../dist/engine-medium.js';
import {engineState, setPartAction} from '../dist/part-actions.js';
import {partCenter} from '../dist/aero.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
test('Jet reports absent atmosphere on planetary and lunar orbits without consuming fuel', () => {
  for (const env of ['orbit', 'moon-orbit']) {
    const f = new Flight(preset('plane'), env);
    try {
      const p = f.parts.find(p => PARTS[p.type].air),
        fuel = [...f.fuel];
      setPartAction(f, p.id, 'engine', true);
      f.throttle = 1;
      f.step(1 / 120);
      assert.equal(engineState(f, p.id).status, '大気なし');
      assert.equal(f.engineThrust.get(p.id) || 0, 0);
      assert.deepEqual([...f.fuel], fuel);
      setPartAction(f, p.id, 'engine', false);
      assert.equal(engineState(f, p.id).status, '停止中');
    } finally {
      f.dispose();
    }
  }
  const f = new Flight(preset('plane'), 'runway');
  try {
    const p = f.parts.find(p => PARTS[p.type].air);
    setPartAction(f, p.id, 'engine', true);
    f.throttle = 0.3;
    f.step(1 / 120);
    assert.ok(f.engineThrust.get(p.id) > 0);
    assert.equal(engineState(f, p.id).status, '燃焼中');
  } finally {
    f.dispose();
  }
});
test('Propeller readout follows actual immersion force and clears when stopped', () => {
  const f = new Flight(preset('boat'), 'water');
  let loaded;
  try {
    const p = f.parts.find(p => PARTS[p.type].water);
    f.sas = false;
    f.omega.set(0, 0, 0);
    setPartAction(f, p.id, 'engine', true);
    f.throttle = 0.5;
    for (const [height, fraction] of [
      [-0.2, 1],
      [-0.025, 0.5],
      [0.2, 0]
    ]) {
      f.q.identity();
      f.pos.set(0, height - partCenter(p).y, 0);
      f.vel.set(0, 0, 0);
      const expected = engineMedium(f, p).submersion;
      assert.ok(Math.abs(expected - fraction) < 0.001);
      f.step(1 / 120);
      assert.ok(Math.abs((f.engineThrust.get(p.id) || 0) - 3000 * expected) < 0.01);
      assert.ok(Math.abs(f.lastThrust - 3000 * expected) < 0.01);
      assert.equal(engineState(f, p.id).status, fraction ? '推進中' : '水中でのみ作動');
    }
    loaded = loadFlight(saveFlight(f));
    loaded.step(1 / 120);
    assert.equal(engineState(loaded, p.id).status, '水中でのみ作動');
    setPartAction(f, p.id, 'engine', false);
    f.step(1 / 120);
    assert.equal(f.engineThrust.get(p.id) || 0, 0);
    assert.equal(engineState(f, p.id).status, '停止中');
  } finally {
    loaded?.dispose();
    f.dispose();
  }
  const f2 = new Flight(preset('boat'), 'orbit');
  try {
    const p = f2.parts.find(p => PARTS[p.type].water);
    setPartAction(f2, p.id, 'engine', true);
    f2.throttle = 1;
    f2.step(1 / 120);
    assert.equal(f2.lastThrust, 0);
    assert.equal(engineState(f2, p.id).status, '水中でのみ作動');
  } finally {
    f2.dispose();
  }
});
