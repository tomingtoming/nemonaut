import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Flight, statistics} from '../dist/core.js';
import {preset, PARTS} from '../dist/catalog.js';
import {setAscentAttitude, lunarOrbitReached} from '../dist/lunar-ascent.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import {descentTelemetry} from '../dist/descent.js';

test('A surface departure remains within centimetres of the ground while settling', () => {
  for (const epoch of [0, 40000]) {
    const f = new Flight(preset('moonlander'), 'moon-surface', epoch);
    try {
      for (let i = 0; i < 1200; i++) {
        f.step(1 / 120);
        assert.ok(descentTelemetry(f).clearance > -0.02, 'feet must not sink into the surface');
      }
      assert.ok(f.landed);
      assert.ok(Math.abs(descentTelemetry(f).clearance) < 0.02);
    } finally {
      f.dispose();
    }
  }
});

test('Ascent orientation changes only the SAS target and survives save/restore', () => {
  const f = new Flight(preset('moonlander'), 'moon-surface', 40000);
  let restored;
  try {
    const q = f.q.clone(),
      v = f.vel.clone(),
      fuel = [...f.fuel];
    const target = setAscentAttitude(f, 45);
    assert.ok(f.q.equals(q));
    assert.ok(f.vel.equals(v));
    assert.deepEqual([...f.fuel], fuel);
    assert.equal(f.throttle, 0);
    assert.ok(Math.abs(target.y - Math.SQRT1_2) < 1e-10);
    assert.ok(Math.abs(target.z - Math.SQRT1_2) < 1e-10);
    restored = loadFlight(saveFlight(f));
    assert.equal(restored.environment, 'moon-surface');
    assert.ok(restored.holdQ.angleTo(f.holdQ) < 1e-6);
    assert.throws(() => setAscentAttitude(f, NaN));
    assert.throws(() => setAscentAttitude(f, 91));
  } finally {
    restored?.dispose();
    f.dispose();
  }
});

test('lunar alignment uses the selected reference before ignition and the mounted engine after ignition', () => {
  const parts = preset('moonlander');
  for (const p of parts) {
    if (PARTS[p.type].commandFrame) p.referenceDirection = 1;
    if (PARTS[p.type].thrust) p.r = [0, 0, -Math.PI / 2];
  }
  const f = new Flight(parts, 'moon-surface', 0);
  try {
    const before = setAscentAttitude(f, 45);
    assert.ok(new T.Vector3(0, -1, 0).applyQuaternion(f.holdQ).distanceTo(before) < 1e-8);
    f.stageNext();
    const fuel = [...f.fuel];
    const after = setAscentAttitude(f, 45);
    assert.ok(new T.Vector3(1, 0, 0).applyQuaternion(f.holdQ).distanceTo(after) < 1e-8);
    assert.deepEqual([...f.fuel], fuel);
    assert.equal(f.throttle, 0);
  } finally {
    f.dispose();
  }
});

test('Actual lunar surface launch returns to a closed orbit with full and post-landing fuel', () => {
  for (const ratio of [1, 0.43]) {
    const f = new Flight(preset('moonlander'), 'moon-surface', ratio === 1 ? 0 : 40000);
    try {
      for (const [id, kg] of f.fuel) f.fuel.set(id, kg * ratio);
      f.stats = statistics(f.parts, f.fuel);
      f.buildColliders();
      for (let i = 0; i < 1200; i++) f.step(1 / 120);
      assert.ok(f.landed);
      assert.equal(f.crashed, false);
      f.stageNext();
      f.throttle = 0.3;
      let phase = 0;
      while (f.time < 650 && !f.crashed && !(lunarOrbitReached(f.orbit) && f.orbit.periapsis > 5000)) {
        if (phase === 0 && f.orbit.altitude > 300) {
          setAscentAttitude(f, 45);
          phase = 1;
        }
        if (phase === 1 && f.orbit.altitude > 3000) {
          setAscentAttitude(f, 0);
          phase = 2;
        }
        if (phase === 2 && f.orbit.apoapsis > 20000) {
          f.throttle = 0;
          setAscentAttitude(f, 0);
          phase = 3;
        }
        if (phase === 3 && f.orbit.vertical < 3) {
          f.throttle = 0.3;
          f.sasMode = 'prograde';
          phase = 4;
        }
        f.step(1 / 120);
      }
      f.throttle = 0;
      assert.equal(f.crashed, false);
      assert.ok(lunarOrbitReached(f.orbit));
      assert.ok(f.orbit.periapsis > 5000);
      assert.ok(f.fuelRatio > 0.2);
      const period = f.orbit.period;
      for (let t = 0; t < period; t += 0.1) f.step(0.1);
      assert.equal(f.crashed, false);
      assert.ok(lunarOrbitReached(f.orbit));
      assert.ok(f.orbit.periapsis > 4500);
    } finally {
      f.dispose();
    }
  }
});
