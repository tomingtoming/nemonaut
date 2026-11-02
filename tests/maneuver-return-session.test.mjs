import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {finiteReturnPlan} from '../dist/finite-return-plan.js';
import {createManeuverNode} from '../dist/maneuver-node.js';
import {lunarReturnPlan, lunarReturnNode} from '../dist/lunar-return.js';
import {advanceCoastFleet} from '../dist/coast-flight.js';
import {ManeuverSession} from '../tools/maneuver-session.mjs';

for (const throttle of [0.1, 1])
  test(`automatic finite return preserves ${throttle * 100}% start and precise cutoff`, t => {
    const f = new Flight(preset('returner'), 'orbit'),
      s = new ManeuverSession();
    try {
      f.stageNext();
      f.stageNext();
      const p = finiteReturnPlan(f, {throttle});
      f.maneuver = createManeuverNode(p.preview, f.time, {plannedThrottle: p.throttle});
      f.maneuver.tolerance = p.tolerance;
      s.start(f);
      assert.equal(s.plan.startTime, p.location.universalTime);
      assert.equal(s.plan.throttle, throttle);
      let first = null;
      for (let i = 0; i < 300 * 120 && s.owner; i++) {
        s.step(f, 1 / 120);
        if (f.throttle > 0) {
          first ??= f.universalTime;
          assert.equal(f.throttle, throttle);
        }
        f.step(1 / 120);
      }
      assert.equal(s.state, 'complete', s.message);
      assert.equal(f.throttle, 0);
      assert.equal(f.crashed, false);
      assert.ok(first >= p.location.universalTime && first < p.location.universalTime + 0.02);
      assert.ok(new T.Vector3(...f.maneuver.remaining).length() < 0.05);
      assert.ok(Math.abs(f.orbit.periapsis - p.prediction.orbit.periapsis) < 100);
      t.diagnostic(
        JSON.stringify({
          throttle,
          start: first,
          predicted: p.prediction.orbit.periapsis,
          actual: f.orbit.periapsis
        })
      );
    } finally {
      f.dispose();
    }
  });
test('automatic lunar return uses the stored start exactly once and retains an atmospheric parent approach', t => {
  const f = new Flight(preset('lander'), 'moon-orbit', 40000),
    s = new ManeuverSession();
  try {
    f.stageNext();
    const p = lunarReturnPlan(f);
    assert.ok(p.ready, p.warnings.join(','));
    f.maneuver = lunarReturnNode(p, f);
    const coast = advanceCoastFleet(f, p.startTime - f.universalTime - 60, {maxSteps: 10000});
    assert.ok(coast.remaining < 0.1);
    s.start(f);
    assert.equal(s.plan.startTime, p.startTime);
    assert.equal(s.plan.throttle, 1);
    let first = null;
    for (let i = 0; i < 300 * 120 && s.owner; i++) {
      s.step(f, 1 / 120);
      if (f.throttle > 0) first ??= f.universalTime;
      f.step(1 / 120);
    }
    assert.equal(s.state, 'complete', s.message);
    assert.equal(f.throttle, 0);
    assert.ok(first >= p.startTime && first < p.startTime + 0.02);
    const exit = advanceCoastFleet(f, 20000, {maxSteps: 10000});
    assert.equal(exit.reason, '月重力圏の境界');
    for (let i = 0; i < 120 && f.orbit.bodyId === 'moon'; i++) f.step(1);
    assert.equal(f.orbit.bodyId, 'planet');
    assert.ok(f.orbit.periapsis > 10000 && f.orbit.periapsis < 70000);
    t.diagnostic(
      JSON.stringify({
        start: first,
        planned: p.startTime,
        periapsis: f.orbit.periapsis,
        predicted: p.finite.exit.orbit.periapsis
      })
    );
    assert.ok(Math.abs(f.orbit.periapsis - p.finite.exit.orbit.periapsis) < 1500);
  } finally {
    f.dispose();
  }
});
