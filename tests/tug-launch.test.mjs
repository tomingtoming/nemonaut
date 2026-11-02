import test from 'node:test';
import assert from 'node:assert/strict';
import {preset} from '../dist/catalog.js';
import {LaunchPilot} from '../dist/launch-pilot.js';
import {stagePerformance} from '../dist/resources.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import {launchWorld} from '../dist/world-operations.js';
import {worldFromFlight, flightFromWorld} from '../dist/world-save.js';
import {PRIMARY_ROTATION_PERIOD} from '../dist/surface-frame.js';
for (const time of [0, PRIMARY_ROTATION_PERIOD / 4])
  test(`Normal tug launcher reaches orbit with docking propellant at UT ${time}`, () => {
    const parts = preset('tug-launcher'),
      world = launchWorld(worldFromFlight(null, {universalTime: time}), {
        parts,
        environment: 'land',
        name: 'Tug Launcher'
      }),
      f = loadFlight(flightFromWorld(world)),
      pilot = new LaunchPilot();
    let restored;
    try {
      assert.equal(parts.length, 23);
      const rcsIds = parts.filter(p => p.type === 'rcs').length;
      assert.equal(rcsIds, 4);
      for (let i = 0; i < 600 * 120 && !pilot.done && !f.crashed; i++) {
        pilot.update(f);
        f.step(1 / 120);
      }
      assert.equal(pilot.done, true);
      assert.equal(f.crashed, false);
      assert.equal(f.stage, 1);
      assert.equal(f.parts.length, 11);
      assert.ok(f.orbit.periapsis > 75000);
      assert.ok(f.orbit.apoapsis < 200000);
      assert.ok(f.fuelRatio > 0.3);
      assert.ok(stagePerformance(f.parts, f.fuel, f.thermal).reduce((s, p) => s + p.dv, 0) > 2400);
      assert.equal(f.parts.filter(p => p.type === 'dockingPort').length, 1);
      assert.equal(
        f.parts.filter(p => p.type === 'rcs').reduce((s, p) => s + f.fuel.get(p.id), 0),
        48
      );
      const saved = saveFlight(f);
      restored = loadFlight(saved);
      assert.deepEqual(restored.parts, f.parts);
      assert.deepEqual([...restored.fuel], [...f.fuel]);
      assert.equal(restored.throttle, 0);
      for (let i = 0; i < 120 * 60; i++) restored.step(1 / 120);
      assert.equal(restored.crashed, false);
      assert.ok(restored.orbit.periapsis > 74000);
      assert.deepEqual([...restored.fuel], [...f.fuel]);
    } finally {
      f.dispose();
      restored?.dispose();
    }
  });
