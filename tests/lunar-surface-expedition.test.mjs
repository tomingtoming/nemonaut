import {stagePerformance} from '../dist/resources.js';
import {descentTelemetry} from '../dist/descent.js';
import {setAscentAttitude} from '../dist/lunar-ascent.js';
import {surfaceRelativeVelocity} from '../dist/surface-frame.js';
const surfaceSpeed = f =>
  surfaceRelativeVelocity(
    f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),
    f.vel,
    f.universalTime
  ).length();
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import {lunarReturnPlan, lunarReturnNode} from '../dist/lunar-return.js';
import {launchWorld, retireWorldVessel} from '../dist/world-operations.js';
import {worldFromFlight, flightFromWorld, validateWorld} from '../dist/world-save.js';
import {recordLunarAchievements} from '../dist/lunar-achievements.js';
import {recordOrbitAchievements} from '../dist/exploration-history.js';
import {centerGuidance} from '../dist/center-facilities.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Flight} from '../dist/core.js';
import {preset, PARTS} from '../dist/catalog.js';
import {LaunchPilot} from '../dist/launch-pilot.js';
import {lunarDeparturePlan, lunarDepartureNode} from '../dist/lunar-departure.js';
import {advanceCoastFleet} from '../dist/coast-flight.js';
import {lunarCapturePlan, captureNode} from '../dist/lunar-capture.js';

test('Surface expedition vacuum stage keeps its stack sockets and landing clearance', () => {
  const parts = preset('lunar-surface-expedition'),
    engine = parts.find(p => p.type === 'engineVacMedium');
  assert.equal(engine.stage, 2);
  const tank = parts.find(p => p.id === engine.parent),
    ring = parts.find(p => p.parent === engine.id && PARTS[p.type].decoupler);
  assert.ok(
    Math.abs(engine.p[1] + PARTS[engine.type].size[1] / 2 - (tank.p[1] - PARTS[tank.type].size[1] / 2)) < 1e-6
  );
  assert.ok(
    Math.abs(engine.p[1] - PARTS[engine.type].size[1] / 2 - (ring.p[1] + PARTS[ring.type].size[1] / 2)) < 1e-6
  );
  for (const leg of parts.filter(p => PARTS[p.type].landingLeg)) {
    const frame = parts.find(p => p.id === leg.parent);
    assert.ok(leg.p[1] + PARTS[leg.type].size[1] / 2 >= frame.p[1] - PARTS[frame.type].size[1] / 2);
    assert.ok(engine.p[1] - PARTS[engine.type].size[1] / 2 - (leg.p[1] - PARTS[leg.type].size[1] / 2) > 0.5);
  }
});

for (const launchTime of [0, 21481.7])
  test(`Surface expedition completes lunar landing and return from UT ${launchTime}`, t => {
    let world = launchWorld(worldFromFlight(null, {universalTime: launchTime}), {
      parts: preset('lunar-surface-expedition'),
      name: 'Lunar expedition',
      environment: 'land'
    });
    const f = loadFlight(flightFromWorld(world)),
      pilot = new LaunchPilot();
    const report = phase =>
      t.diagnostic(
        JSON.stringify({
          phase,
          ut: Number(f.universalTime.toFixed(1)),
          fuel: Number([...f.fuel.values()].reduce((a, b) => a + b, 0).toFixed(1)),
          dv: Math.round(stagePerformance(f.parts, f.fuel, f.thermal).reduce((a, b) => a + b.dv, 0)),
          periapsis: Math.round(f.orbit.periapsis),
          apoapsis: Math.round(f.orbit.apoapsis)
        })
      );
    try {
      for (let i = 0; i < 72000 && !pilot.done && !f.crashed; i++) {
        pilot.update(f);
        f.step(1 / 120);
      }
      assert.ok(pilot.done);
      assert.ok(f.detached.every(v => v.throttle === 0));
      report('planet-orbit');
      world.history = recordOrbitAchievements(world.history, f);
      const before = {pos: f.pos.clone(), vel: f.vel.clone(), fuel: [...f.fuel], ut: f.universalTime},
        p = lunarDeparturePlan(f);
      assert.ok(p.ready, p.warnings.join(' / '));
      assert.ok(f.pos.equals(before.pos) && f.vel.equals(before.vel));
      assert.deepEqual([...f.fuel], before.fuel);
      assert.equal(f.universalTime, before.ut);
      assert.ok(p.startTime - f.universalTime > 60);
      f.maneuver = lunarDepartureNode(p, f);
      const saved = saveFlight(f),
        restored = loadFlight(saved);
      try {
        assert.deepEqual(restored.maneuver, f.maneuver);
      } finally {
        restored.dispose();
      }
      for (const key of ['midTime', 'duration', 'deltaV', 'periapsis']) {
        const bad = structuredClone(saved);
        bad.maneuver.departure[key] = -1;
        assert.throws(() => loadFlight(bad));
      }
      f.sasMode = 'maneuver';
      while (f.universalTime < p.startTime - 60) {
        const result = advanceCoastFleet(f, p.startTime - 60 - f.universalTime, {maxSteps: 10000});
        if (result.remaining < 0.01) break;
        for (let i = 0; i < 1200 && f.universalTime < p.startTime - 60; i++) f.step(1 / 120);
      }
      assert.throws(() => lunarDepartureNode(p, f), /再計算/);
      assert.ok(Math.abs(f.universalTime - (p.startTime - 60)) < 0.1);
      while (f.universalTime < p.startTime) f.step(Math.min(1 / 120, p.startTime - f.universalTime));
      for (let i = 0; i < Math.ceil((p.burn.duration + 60) * 120) && !f.maneuver.complete; i++) {
        const left = new T.Vector3(...f.maneuver.remaining).length();
        f.throttle = left < 2 ? 0.01 : left < 10 ? 0.1 : 1;
        f.step(1 / 120);
      }
      f.throttle = 0;
      assert.ok(f.maneuver.complete);
      let arrivalCoast;
      // A spent stage may enter atmosphere while the active vessel coasts to the moon.
      // Keep every stage and integrate it normally until its warp blocker clears.
      for (let attempt = 0; attempt < 120; attempt++) {
        arrivalCoast = advanceCoastFleet(f, 50000, {maxSteps: 10000});
        if (arrivalCoast.reason === '月重力圏の境界') break;
        assert.equal(arrivalCoast.blocker?.code, 'surface', JSON.stringify(arrivalCoast.blocker));
        assert.ok(
          !f.parts.some(p => p.id === arrivalCoast.blocker.vesselId),
          'active craft must not approach the surface during transfer'
        );
        for (let i = 0; i < 1200; i++) f.step(1 / 120);
      }
      assert.equal(arrivalCoast.reason, '月重力圏の境界');
      for (let i = 0; i < 120 && f.orbit.bodyId !== 'moon'; i++) f.step(1);
      assert.equal(f.orbit.bodyId, 'moon');
      assert.ok(Math.abs(f.orbit.periapsis - p.finite.closest.altitude) < 1000);
      assert.equal(f.crashed, false);
      world.history = recordLunarAchievements(world.history, f);
      assert.equal(world.history.at(-1).type, 'moon-arrival');
      const capture = lunarCapturePlan(f);
      assert.ok(capture.ready, capture.warnings.join(' / '));
      assert.ok(capture.burn.fuelRemaining > 600);
      f.maneuver = captureNode(capture, f);
      f.sasMode = 'maneuver';
      for (let i = 0; i < 120; i++) f.step(0.25);
      assert.equal(
        advanceCoastFleet(f, capture.startTime - f.universalTime - 60, {maxSteps: 10000}).remaining,
        0
      );
      const burn = start => {
        while (f.universalTime < start) f.step(Math.min(1 / 120, start - f.universalTime));
        for (let i = 0; i < 14400 && !f.maneuver.complete; i++) {
          const left = new T.Vector3(...f.maneuver.remaining).length();
          f.throttle = left < 2 ? 0.01 : left < 10 ? 0.1 : 1;
          f.step(1 / 120);
        }
        f.throttle = 0;
        assert.ok(f.maneuver.complete);
      };
      burn(capture.startTime);
      assert.ok(f.orbit.energy < 0);
      report('moon-orbit');

      f.maneuver = null;
      f.sasMode = 'retrograde';
      for (let i = 0; i < 3600; i++) f.step(1 / 120);
      let deadline = f.time + 180;
      f.throttle = 1;
      while (f.orbit.periapsis > 1000 && f.time < deadline && !f.crashed) f.step(1 / 120);
      f.throttle = 0;
      for (let i = 0; i < 120; i++) f.step(0.25);
      assert.equal(advanceCoastFleet(f, 20000, {maxSteps: 10000}).reason, '大気・地表への接近');
      deadline = f.time + 180;
      f.throttle = 1;
      while (f.orbit.speed > 2 && f.time < deadline && !f.crashed) f.step(1 / 120);
      f.throttle = 0;
      f.sasMode = 'radial';
      deadline = f.time + 4000;
      while (!f.landed && !f.crashed && f.time < deadline) {
        const d = descentTelemetry(f),
          target = -Math.min(100, Math.max(0.6, d.clearance / 15));
        f.throttle = Math.max(0, Math.min(1, (d.gravity + (target - d.vertical) * 0.8) / d.acceleration));
        if (d.clearance < 0.2 && Math.abs(d.vertical) < 1) f.throttle = 0;
        f.step(1 / 60);
      }
      f.throttle = 0;
      report('moon-touchdown');
      assert.ok(f.landed);
      assert.equal(f.crashed, false);
      assert.ok(f.fuelRatio > 0.14, 'retain ascent fuel after lunar touchdown');
      world.history = recordLunarAchievements(world.history, f);
      assert.ok(world.history.some(e => e.type === 'moon-landing'));
      setAscentAttitude(f, 90);
      f.throttle = 0.3;
      let phase = 0;
      deadline = f.time + 900;
      while (f.time < deadline && !f.crashed && f.orbit.periapsis < 5000) {
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
      assert.ok(f.orbit.periapsis > 5000);
      report('moon-ascent-orbit');
      const ret = lunarReturnPlan(f, {targetPeriapsis: 15000});
      assert.ok(ret.ready, ret.warnings.join(' / '));
      f.maneuver = lunarReturnNode(ret, f);
      f.sasMode = 'maneuver';
      assert.ok(
        advanceCoastFleet(f, ret.startTime - f.universalTime - 60, {maxSteps: 10000}).remaining < 0.001
      );
      burn(ret.startTime);
      report('return-burn');
      assert.equal(advanceCoastFleet(f, 50000, {maxSteps: 10000}).reason, '月重力圏の境界');
      for (let i = 0; i < 120 && f.orbit.bodyId === 'moon'; i++) f.step(1);
      for (let i = 0; i < 120; i++) f.step(0.25);
      assert.equal(advanceCoastFleet(f, 60000, {maxSteps: 10000}).reason, '大気・地表への接近');
      assert.ok(Math.abs(f.orbit.periapsis - ret.finite.exit.orbit.periapsis) < 1000);
      f.stageNext();
      f.sasMode = 'retrograde';
      f.stageNext();
      assert.equal(f.parts.length, 3);
      for (let i = 0; i < 900 * 120 && !f.crashed && !f.landed; i++) f.step(1 / 120);
      assert.ok(f.landed);
      assert.equal(f.crashed, false);
      assert.ok([...f.thermal.values()].every(s => !s.failed));
      assert.ok(surfaceSpeed(f) < 1);
      assert.equal(f.detached.length, 3);
      world.history = recordLunarAchievements(world.history, f);
      world = worldFromFlight(saveFlight(f), {history: world.history});
      const recovered = retireWorldVessel(world, f.vesselId, 'recover').world;
      const restoredWorld = validateWorld(JSON.parse(JSON.stringify(recovered)));
      const record = restoredWorld.history.at(-1),
        arrival = world.history.find(e => e.type === 'moon-arrival');
      assert.deepEqual(record.moonEventIds, [arrival.id]);
      assert.equal(record.partIds.length, 3);
      assert.ok(restoredWorld.history.some(e => e.type === 'moon-landing'));
      const guide = centerGuidance({
        history: restoredWorld.history,
        partCount: 0,
        designCount: 1,
        vesselCount: restoredWorld.vessels.length
      });
      assert.deepEqual(
        guide.map(e => e.completed),
        [true, true, true, true, true, true]
      );
    } finally {
      f.dispose();
    }
  });
