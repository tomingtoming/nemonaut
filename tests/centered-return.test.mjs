import {finiteBurnPreview} from '../dist/finite-burn.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {deorbitPlan} from '../dist/deorbit-plan.js';
import {createManeuverNode} from '../dist/maneuver-node.js';
import {captureBurnEstimate} from '../dist/lunar-capture.js';

// Compare identical planned impulses and engines, changing only ignition time.
// This measures the approximation's limit; it is not a universal error bound.
for (const power of [0.1, 0.01])
  test(`centering the return burn reduces but does not remove error at ${power * 100}%`, t => {
    const results = [];
    for (const centered of [false, true]) {
      const f = new Flight(preset('returner'), 'orbit');
      try {
        f.stageNext();
        f.stageNext();
        const plan = deorbitPlan(f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)), f.vel, 0, {
          delay: 360
        });
        const fuel = [...f.fuel],
          duration = captureBurnEstimate(f, plan.preview.impulse.length()).duration / power;
        assert.deepEqual([...f.fuel], fuel, 'estimating the burn spends nothing');
        if (power === 0.01)
          assert.ok(duration > plan.preview.original.period * 0.05, 'a long burn relative to the orbit');
        const start = 360 - (centered ? duration / 2 : 0);
        assert.ok(start > 60, 'attitude alignment lead time');
        const before = {fuel: [...f.fuel], pos: f.pos.toArray(), vel: f.vel.toArray(), time: f.universalTime},
          prediction = finiteBurnPreview(f, plan.preview.impulse, start, {throttle: power});
        assert.deepEqual(
          {fuel: [...f.fuel], pos: f.pos.toArray(), vel: f.vel.toArray(), time: f.universalTime},
          before
        );
        f.maneuver = createManeuverNode(plan.preview, 0);
        f.maneuver.stopAtTarget = true;
        f.maneuver.tolerance = 0.05;
        f.sas = true;
        f.sasMode = 'maneuver';
        while (f.universalTime < start) f.step(1 / 120);
        const began = f.universalTime;
        for (let i = 0; i < 120 * 800 && !f.maneuver.complete && !f.crashed; i++) {
          f.throttle = power;
          f.step(1 / 120);
        }
        assert.equal(f.maneuver.complete, true);
        assert.equal(f.crashed, false);
        assert.ok(
          Math.abs(f.universalTime - began - duration) < 1,
          'burn time follows the full-thrust estimate divided by the throttle'
        );
        assert.ok(
          Math.abs(f.orbit.periapsis - prediction.orbit.periapsis) < 10,
          'finite prediction agrees with physical flight within 10 m in this case'
        );
        results.push({
          predictedPeriapsis: prediction.orbit.periapsis,
          centered,
          start: began,
          duration: f.universalTime - began,
          periapsis: f.orbit.periapsis,
          error: Math.abs(f.orbit.periapsis - 25000)
        });
      } finally {
        f.dispose();
      }
    }
    assert.ok(results[1].error < results[0].error * 0.5, 'centering must materially improve this case');
    assert.ok(
      Math.abs(results[0].duration - results[1].duration) < 0.1,
      'same delivered impulse and fuel mass'
    );
    if (power === 0.01) {
      assert.ok(results[1].error > 5000, 'midpoint timing alone still misses the target by kilometres');
      assert.ok(
        results[0].periapsis - 25000 > 10000,
        'the instantaneous plan is not the endpoint of a long burn started at the node'
      );
    }
    t.diagnostic(JSON.stringify(results));
  });
