import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {bodyOrbitState} from '../dist/celestial.js';
import {centerOfVessel, relativeState} from '../dist/relative-navigation.js';
import {relativeStopPlan} from '../dist/relative-stop-plan.js';
import {maneuverPreview} from '../dist/maneuver.js';
import {createManeuverNode} from '../dist/maneuver-node.js';
test('Recomputed relative-stop plan brakes real moving fleet with opt-in cutoff and retains separation', () => {
  const f = new Flight(preset('rocket'), 'orbit'),
    g = new Flight(preset('rocket'), 'orbit');
  g.pos.x += 100;
  f.vel.z += 20;
  f.detached = [g];
  const plan = () => {
    const p = relativeStopPlan(
      bodyOrbitState(centerOfVessel(f), f.vel, f.universalTime),
      bodyOrbitState(centerOfVessel(g), g.vel, g.universalTime)
    );
    f.maneuver = createManeuverNode(
      maneuverPreview(centerOfVessel(f), f.vel, p.location, p.components, f.universalTime),
      f.time
    );
    f.maneuver.stopAtTarget = true;
    f.sasMode = 'maneuver';
    return p;
  };
  try {
    plan();
    for (let i = 0; i < 60 * 120; i++) f.step(1 / 120);
    assert.equal(f.throttle, 0);
    assert.equal(f.fuelRatio, 1);
    const refreshed = plan();
    assert.equal(refreshed.location, 'now');
    const before = relativeState(f, g).speed;
    assert.ok(before > 19);
    f.stageNext();
    f.throttle = 0.1;
    for (let i = 0; i < 120 * 120 && !f.maneuver.complete; i++) f.step(1 / 120);
    assert.equal(f.maneuver.complete, true);
    assert.equal(f.throttle, 0);
    assert.ok(f.fuelRatio < 1);
    const after = relativeState(f, g);
    assert.ok(after.speed < 0.6, JSON.stringify(after));
    assert.ok(after.distance > 1000, 'velocity matching must not move craft to target');
    assert.ok(Math.abs(f.universalTime - g.universalTime) < 1e-6);
    const fuel = [...f.fuel];
    for (let i = 0; i < 120; i++) f.step(1 / 120);
    assert.deepEqual([...f.fuel], fuel);
  } finally {
    f.dispose();
  }
});
