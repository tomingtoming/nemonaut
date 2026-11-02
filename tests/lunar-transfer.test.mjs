import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {lunarTransferSeed} from '../dist/lunar-transfer.js';
import {predictTrajectory} from '../dist/trajectory.js';
import {bodyState, MOON} from '../dist/celestial.js';
import {PLANET, center} from '../dist/planet.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import {launchIntoFleet} from '../dist/launch-fleet.js';

test('Departure phase tracks the moon at different epochs without changing circular orbit energy', () => {
  for (const epoch of [0, 40000, 100000, 1e8]) {
    const p = lunarTransferSeed(epoch, {mass: 2345, thrust: 45000, isp: 300});
    assert.ok(Math.abs(p.position.distanceTo(center) - 680000) < 1e-8);
    assert.ok(Math.abs(p.velocity.length() - Math.sqrt(PLANET.mu / 680000)) < 1e-8);
    assert.ok(Math.abs(p.position.clone().sub(center).dot(p.velocity)) < 1e-6);
    assert.ok(p.deltaV > 850 && p.deltaV < 860);
    assert.ok(p.fuelRequired < 1800);
  }
  assert.throws(() => lunarTransferSeed(0, {mass: 0, thrust: 1, isp: 300}));
});

test('Real finite engine burn reaches the moving lunar sphere at multiple epochs with fuel remaining', () => {
  for (const epoch of [0, 40000, 100000]) {
    const f = new Flight(preset('orbiter'), 'transfer', epoch);
    try {
      assert.equal(f.transferGuide.startTime, epoch + 60);
      while (f.universalTime < f.transferGuide.startTime - 1e-6)
        f.step(Math.min(1 / 120, f.transferGuide.startTime - f.universalTime));
      assert.equal(f.transferGuide.delivered, 0);
      assert.equal(f.fuelRatio, 1);
      f.stageNext();
      f.throttle = 1;
      while (f.transferGuide.delivered < f.transferGuide.target && f.time < 200) {
        if (f.transferGuide.target - f.transferGuide.delivered < 100) f.throttle = 0.1;
        f.step(1 / 120);
      }
      assert.ok(f.time > 125 && f.time < 140);
      assert.ok(f.fuelRatio > 0.65 && f.fuelRatio < 0.7);
      assert.ok([...f.charge.values()].reduce((a, b) => a + b, 0) > 150);
      f.throttle = 0;
      f.sas = false;
      const after = f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),
        prediction = predictTrajectory(after, f.vel, f.universalTime, {duration: 50000}),
        entry = prediction.events.find(e => e.type === 'enter-moon');
      assert.ok(entry);
      assert.ok(prediction.closest.altitude > 450000);
      assert.ok(
        prediction.closest.altitude < 500000,
        JSON.stringify({closest: prediction.closest.altitude, burn: f.time, entry})
      );
      while (f.orbit.bodyId !== 'moon' && f.time < 35000) f.step(0.5);
      assert.equal(f.orbit.bodyId, 'moon');
      assert.ok(Math.abs(f.universalTime - entry.time) < 3);
      assert.equal(f.crashed, false);
      assert.ok(
        f.pos
          .clone()
          .add(f.stats.com.clone().applyQuaternion(f.q))
          .distanceTo(bodyState(MOON, f.universalTime).position) <
          MOON.sphereOfInfluence + 1
      );
    } finally {
      f.dispose();
    }
  }
});

test('Transfer launch, burn progress and planned epoch survive save and restore', () => {
  const f = launchIntoFleet(null, {
    parts: preset('orbiter'),
    environment: 'transfer',
    name: 'Lunar',
    universalTime: 1234
  });
  let restored;
  try {
    f.step(0.1);
    f.stageNext();
    f.throttle = 1;
    f.step(0.1);
    const saved = saveFlight(f);
    restored = loadFlight(saved);
    assert.deepEqual(restored.transferGuide, f.transferGuide);
    assert.equal(restored.transferGuide.startTime, 1294);
    assert.ok(restored.transferGuide.delivered > 0);
    const initial = restored.transferGuide.delivered;
    restored.throttle = 0;
    restored.step(0.1);
    assert.equal(restored.transferGuide.delivered, initial);
    for (const field of ['target', 'startTime', 'burnTime', 'delivered']) {
      const bad = structuredClone(saved);
      bad.transferGuide[field] = NaN;
      assert.throws(() => loadFlight(bad));
    }
  } finally {
    restored?.dispose();
    f.dispose();
  }
});
