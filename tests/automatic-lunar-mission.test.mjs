import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {AscentSession} from '../dist/ascent-session.js';
import {ManeuverSession} from '../dist/maneuver-session.js';
import {lunarDeparturePlan, lunarDepartureNode} from '../dist/lunar-departure.js';
import {lunarCapturePlan, captureNode} from '../dist/lunar-capture.js';
import {lunarReturnPlan, lunarReturnNode} from '../dist/lunar-return.js';
import {surfaceRelativeVelocity} from '../dist/surface-frame.js';
import {advanceCoastFleet} from '../dist/coast-flight.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';

function execute(f, plan, t) {
  const target = plan.startTime - 60;
  while (f.universalTime < target - 0.01) {
    const result = advanceCoastFleet(f, target - f.universalTime, {maxSteps: 10000});
    if (result.remaining < 0.01) break;
    const before = f.universalTime;
    for (let i = 0; i < 1200 && f.universalTime < target; i++) f.step(1 / 120);
    assert.ok(f.universalTime > before);
  }
  const s = new ManeuverSession();
  s.start(f);
  assert.equal(s.plan.startTime, plan.startTime);
  let first = null;
  for (let i = 0; i < 1200 * 120 && s.owner; i++) {
    s.step(f, 1 / 120);
    if (f.throttle > 0) first ??= f.universalTime;
    f.step(1 / 120);
  }
  t.diagnostic(
    JSON.stringify({
      phase: f.maneuver.departure ? 'departure' : f.maneuver.returnPlan ? 'return' : 'capture',
      state: s.state,
      message: s.message,
      start: first,
      planned: plan.startTime,
      fuel: f.fuelRatio,
      duration: f.universalTime - first,
      estimatedDuration: s.plan.duration
    })
  );
  assert.equal(s.state, 'complete', s.message);
  assert.equal(f.throttle, 0);
  assert.equal(f.crashed, false);
  assert.ok(first >= plan.startTime && first < plan.startTime + 0.02);
  assert.ok(
    Math.abs(f.universalTime - first - s.plan.duration) < 1,
    'estimated duration includes the low-power terminal burn'
  );
}
test('ground ascent, automatic lunar orbit and return end in a retained capsule touchdown', t => {
  const f = new Flight(preset('lunar-expedition'), 'land'),
    ascent = new AscentSession();
  let restored;
  try {
    ascent.start(f, {altitude: 90000, inclination: 0});
    for (let i = 0; i < 1200 * 120 && ascent.owner; i++) {
      ascent.step(f, 1 / 120);
      f.step(1 / 120);
    }
    assert.equal(ascent.state, 'complete', ascent.message);
    assert.equal(f.crashed, false);
    const departure = lunarDeparturePlan(f);
    assert.ok(departure.ready, departure.warnings.join(','));
    f.maneuver = lunarDepartureNode(departure, f);
    execute(f, departure, t);
    assert.equal(advanceCoastFleet(f, 50000, {maxSteps: 10000}).reason, '月重力圏の境界');
    for (let i = 0; i < 120 && f.orbit.bodyId !== 'moon'; i++) f.step(1);
    assert.equal(f.orbit.bodyId, 'moon');
    assert.ok(Math.abs(f.orbit.periapsis - departure.finite.closest.altitude) < 1000);
    const capture = lunarCapturePlan(f);
    assert.ok(capture.ready, capture.warnings.join(','));
    f.maneuver = captureNode(capture, f);
    execute(f, capture, t);
    assert.ok(f.orbit.stable);
    assert.equal(f.orbit.bodyId, 'moon');
    assert.ok(f.orbit.energy < 0);
    const tolerance = capture.afterOrbit.radius * 0.01;
    assert.ok(Math.abs(f.orbit.periapsis - capture.afterOrbit.periapsis) < tolerance);
    assert.ok(Math.abs(f.orbit.apoapsis - capture.afterOrbit.apoapsis) < tolerance);
    restored = loadFlight(saveFlight(f));
    assert.equal(restored.maneuver.complete, true);
    assert.equal(restored.orbit.bodyId, 'moon');
    assert.equal(restored.universalTime, f.universalTime);
    const ret = lunarReturnPlan(f, {targetPeriapsis: 15000});
    assert.ok(ret.ready, ret.warnings.join(','));
    f.maneuver = lunarReturnNode(ret, f);
    execute(f, ret, t);
    assert.ok(f.fuelRatio > 0);
    assert.equal(advanceCoastFleet(f, 50000, {maxSteps: 10000}).reason, '月重力圏の境界');
    for (let i = 0; i < 120 && f.orbit.bodyId === 'moon'; i++) f.step(1);
    assert.equal(f.orbit.bodyId, 'planet');
    for (let i = 0; i < 120; i++) f.step(0.25);
    assert.equal(advanceCoastFleet(f, 60000, {maxSteps: 10000}).reason, '大気・地表への接近');
    assert.ok(Math.abs(f.orbit.periapsis - ret.finite.exit.orbit.periapsis) < 1000);
    f.stageNext();
    f.sasMode = 'retrograde';
    f.stageNext();
    assert.equal(f.parts.length, 3);
    for (let i = 0; i < 900 * 120 && !f.crashed && !f.landed; i++) f.step(1 / 120);
    assert.equal(f.landed, true);
    assert.equal(f.crashed, false);
    assert.ok([...f.thermal.values()].every(s => !s.failed));
    assert.ok(
      surfaceRelativeVelocity(
        f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),
        f.vel,
        f.universalTime
      ).length() < 1
    );
    restored.dispose();
    restored = loadFlight(saveFlight(f));
    assert.equal(restored.landed, true);
    assert.equal(restored.parts.length, 3);
  } finally {
    restored?.dispose();
    f.dispose();
  }
});
