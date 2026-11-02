import test from 'node:test';
import assert from 'node:assert/strict';
import {timedRendezvousTransfer, timedRelativeStopPlan, transferThrottle} from '../dist/timed-rendezvous.js';
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
test('Departure, coast, advance alignment and timed braking reach close low-speed rendezvous', () => {
  const f = new Flight(preset('rocket'), 'orbit'),
    g = new Flight(preset('rocket'), 'orbit');
  const q = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), 0.03);
  g.pos.copy(
    centerOfVessel(g).sub(center).applyQuaternion(q).add(center).sub(g.stats.com.clone().applyQuaternion(g.q))
  );
  g.vel.applyQuaternion(q);
  f.detached = [g];
  try {
    f.stageNext();
    const plan = timedRendezvousTransfer(f, bodyOrbitState(centerOfVessel(g), g.vel, 0));
    assert.ok(plan.burn.offset > 1 && plan.burn.offset < 1.5);
    assert.ok(plan.burn.duration > 6 && plan.burn.duration < 6.5);
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
    for (let i = 0; i < 120 * 120 && !f.maneuver.complete; i++) {
      f.throttle =
        Math.hypot(...f.maneuver.remaining) < 0.5 ? 0.01 : Math.hypot(...f.maneuver.remaining) < 2 ? 0.1 : 1;
      f.step(1 / 120);
    }
    f.throttle = 0;
    assert.equal(f.maneuver.complete, true);
    assert.ok(f.fuelRatio < 1);
    const stop = timedRelativeStopPlan(f, bodyOrbitState(centerOfVessel(g), g.vel, g.universalTime));
    assert.ok(stop.time > 60);
    f.maneuver = createManeuverNode(
      maneuverPreview(centerOfVessel(f), f.vel, stop.location, stop.components, f.universalTime),
      f.time
    );
    f.maneuver.stopAtTarget = true;
    f.maneuver.tolerance = 0.05;
    const coast = advanceCoastFleet(f, stop.time, {maxSteps: 10000});
    assert.equal(coast.reason, '予定噴射の直前');
    assert.ok(Math.abs(stop.location.universalTime - f.universalTime - 60) < 0.05);
    while (f.universalTime < stop.location.universalTime - 1e-6)
      f.step(Math.min(1 / 120, stop.location.universalTime - f.universalTime));
    assert.ok(new T.Vector3(0, 1, 0).applyQuaternion(f.q).angleTo(maneuverDirection(f.maneuver)) < 0.001);
    for (let i = 0; i < 120 * 120 && !f.maneuver.complete; i++) {
      f.throttle = transferThrottle(Math.hypot(...f.maneuver.remaining));
      f.step(1 / 120);
    }
    assert.equal(f.maneuver.complete, true);
    assert.equal(f.throttle, 0);
    assert.ok(relativeState(f, g).distance > 40 && relativeState(f, g).distance < 70);
    assert.ok(relativeState(f, g).speed < 0.1);
    assert.ok(f.fuelRatio < 1);
  } finally {
    f.dispose();
  }
});
