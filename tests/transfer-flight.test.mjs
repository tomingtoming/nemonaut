import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {bodyOrbitState} from '../dist/celestial.js';
import {center} from '../dist/planet.js';
import {centerOfVessel, relativeState} from '../dist/relative-navigation.js';
import {rendezvousTransfer} from '../dist/rendezvous-transfer.js';
import {maneuverPreview} from '../dist/maneuver.js';
import {createManeuverNode, maneuverDirection} from '../dist/maneuver-node.js';
import {advanceCoastFleet} from '../dist/coast-flight.js';
test('Finite precision transfer consumes fuel and reaches within 300 m at the planned epoch', () => {
  const f = new Flight(preset('rocket'), 'orbit'),
    g = new Flight(preset('rocket'), 'orbit');
  const q = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), 0.03);
  g.pos.copy(
    centerOfVessel(g).sub(center).applyQuaternion(q).add(center).sub(g.stats.com.clone().applyQuaternion(g.q))
  );
  g.vel.applyQuaternion(q);
  f.detached = [g];
  try {
    const plan = rendezvousTransfer(
      bodyOrbitState(centerOfVessel(f), f.vel, 0),
      bodyOrbitState(centerOfVessel(g), g.vel, 0)
    );
    const preview = maneuverPreview(
      centerOfVessel(f),
      f.vel,
      {universalTime: plan.epoch},
      plan.components,
      0
    );
    f.maneuver = createManeuverNode(preview, f.time);
    f.maneuver.stopAtTarget = true;
    f.maneuver.tolerance = 0.05;
    f.sasMode = 'maneuver';
    while (f.universalTime < plan.epoch - 1e-6) f.step(Math.min(1 / 120, plan.epoch - f.universalTime));
    assert.ok(new T.Vector3(0, 1, 0).applyQuaternion(f.q).angleTo(maneuverDirection(f.maneuver)) < 0.001);
    f.stageNext();
    for (let i = 0; i < 120 * 120 && !f.maneuver.complete; i++) {
      f.throttle =
        Math.hypot(...f.maneuver.remaining) < 0.5 ? 0.01 : Math.hypot(...f.maneuver.remaining) < 2 ? 0.1 : 1;
      f.step(1 / 120);
    }
    f.throttle = 0;
    assert.equal(f.maneuver.complete, true);
    assert.ok(f.fuelRatio < 1);
    assert.ok(Math.hypot(...f.maneuver.remaining) < 0.05);
    const coast = advanceCoastFleet(f, plan.arrivalTime - f.universalTime, {maxSteps: 10000});
    assert.equal(coast.reason, null);
    assert.ok(Math.abs(f.universalTime - plan.arrivalTime) < 1e-6);
    assert.ok(relativeState(f, g).distance < 300);
    assert.ok(relativeState(f, g).distance > 100);
    assert.ok(relativeState(f, g).speed > 30, 'arrival braking is not applied');
  } finally {
    f.dispose();
  }
});
