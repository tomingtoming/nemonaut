import {surfaceRelativeVelocity} from '../dist/surface-frame.js';
const surfaceSpeed = f =>
  surfaceRelativeVelocity(
    f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),
    f.vel,
    f.universalTime
  ).length();
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {lunarReturnPlan, lunarReturnNode} from '../dist/lunar-return.js';
import {advanceCoastFleet} from '../dist/coast-flight.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';

test('Lunar return capsule burns, escapes, separates, survives entry and lands with its real parachute', () => {
  let f = new Flight(preset('lunar-return'), 'moon-orbit', 40000);
  try {
    f.stageNext();
    const plan = lunarReturnPlan(f, {targetPeriapsis: 15000});
    assert.ok(plan.ready, plan.warnings.join(' / '));
    f.maneuver = lunarReturnNode(plan, f);
    f.sasMode = 'maneuver';
    advanceCoastFleet(f, plan.startTime - f.universalTime - 60, {maxSteps: 10000});
    while (f.universalTime < plan.startTime) f.step(Math.min(1 / 120, plan.startTime - f.universalTime));
    for (let i = 0; i < 14400 && !f.maneuver.complete; i++) {
      const left = new T.Vector3(...f.maneuver.remaining).length();
      f.throttle = left < 2 ? 0.01 : left < 10 ? 0.1 : 1;
      f.step(1 / 120);
    }
    f.throttle = 0;
    assert.ok(f.maneuver.complete);
    assert.ok(f.fuelRatio < 0.9);
    assert.equal(advanceCoastFleet(f, 20000, {maxSteps: 10000}).reason, '月重力圏の境界');
    for (let i = 0; i < 120 && f.orbit.bodyId === 'moon'; i++) f.step(1);
    for (let i = 0; i < 120; i++) f.step(0.25);
    assert.equal(f.orbit.bodyId, 'planet');
    assert.ok(Math.abs(f.orbit.periapsis - plan.finite.exit.orbit.periapsis) < 1000);
    assert.equal(advanceCoastFleet(f, 60000, {maxSteps: 10000}).reason, '大気・地表への接近');
    assert.ok(f.orbit.altitude > 70000);
    const ut = f.universalTime,
      velocity = f.vel.clone();
    f.stageNext();
    f.sasMode = 'retrograde';
    f.stageNext();
    assert.deepEqual(
      f.parts.map(p => p.type),
      ['capsule', 'heatShield', 'parachute']
    );
    assert.equal(f.detached.length, 1);
    assert.equal(f.detached[0].universalTime, ut);
    assert.ok(f.vel.distanceTo(velocity) < 1);
    assert.equal(f.throttle, 0);
    const saved = saveFlight(f),
      restored = loadFlight(saved);
    assert.deepEqual(restored.maneuver, f.maneuver);
    assert.equal(restored.maneuver.returnPlan.targetPeriapsis, 15000);
    const bad = structuredClone(saved);
    bad.maneuver.returnPlan.targetPeriapsis = NaN;
    assert.throws(() => loadFlight(bad));
    assert.deepEqual([...restored.thermal], [...f.thermal]);
    f.dispose();
    f = restored;
    let maxSpeed = 0,
      sawReefed = false,
      sawOpen = false;
    for (let i = 0; i < 900 * 120 && !f.crashed && !f.landed; i++) {
      f.step(1 / 120);
      maxSpeed = Math.max(maxSpeed, f.orbit.speed);
      const chute = [...f.chutes.values()][0];
      sawReefed ||= chute.status === 'reefed';
      sawOpen ||= chute.status === 'open';
    }
    assert.ok(maxSpeed > 3100);
    assert.equal(f.crashed, false);
    assert.ok(f.landed);
    assert.ok(sawReefed && sawOpen);
    assert.ok(surfaceSpeed(f) < 1);
    assert.ok([...f.thermal.values()].every(s => !s.failed));
    const shield = f.parts.find(p => p.type === 'heatShield');
    assert.ok(f.thermal.get(shield.id).ablator <= 40);
    assert.ok(f.thermal.get(shield.id).ablator > 0);
  } finally {
    f.dispose();
  }
});
