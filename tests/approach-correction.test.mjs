import test from 'node:test';
import assert from 'node:assert/strict';
import {withRendezvousTarget} from '../dist/rendezvous-practice.js';
import {worldFromFlight, flightFromWorld} from '../dist/world-save.js';
import {launchWorld} from '../dist/world-operations.js';
import {loadFlight} from '../dist/flight-save.js';
import {preset} from '../dist/catalog.js';
import {timedRendezvousTransfer, timedRelativeStopPlan, transferThrottle} from '../dist/timed-rendezvous.js';
import {bodyOrbitState} from '../dist/celestial.js';
import {centerOfVessel, relativeState} from '../dist/relative-navigation.js';
import {maneuverPreview} from '../dist/maneuver.js';
import {createManeuverNode} from '../dist/maneuver-node.js';
import {advanceCoastFleet} from '../dist/coast-flight.js';
test('Burns started about 5 s late leave a 600-700 m miss that a two-minute transfer corrects to under 100 m', () => {
  const f = loadFlight(
    flightFromWorld(
      withRendezvousTarget(
        launchWorld(worldFromFlight(null), {parts: preset('orbital-tug'), environment: 'orbit', name: 'Tug'})
      )
    )
  );
  const g = f.detached[0];
  const target = () => bodyOrbitState(centerOfVessel(g), g.vel, g.universalTime);
  function execute(plan, delay = 0, full = false) {
    const location = plan.location ?? {universalTime: plan.epoch};
    f.maneuver = createManeuverNode(
      maneuverPreview(centerOfVessel(f), f.vel, location, plan.components, f.universalTime),
      f.time
    );
    f.maneuver.stopAtTarget = true;
    f.maneuver.tolerance = 0.05;
    f.sasMode = 'maneuver';
    advanceCoastFleet(f, Math.max(0, location.universalTime - f.universalTime), {maxSteps: 10000});
    while (f.universalTime < location.universalTime + delay - 1e-6)
      f.step(Math.min(1 / 120, location.universalTime + delay - f.universalTime));
    for (let i = 0; i < 120 * 120 && !f.maneuver.complete; i++) {
      f.throttle = full ? 1 : transferThrottle(Math.hypot(...f.maneuver.remaining));
      f.step(1 / 120);
    }
    f.throttle = 0;
    if (!f.maneuver.complete) throw Error('burn incomplete');
  }
  try {
    f.stageNext();
    execute(timedRendezvousTransfer(f, target()), 5.5, true);
    f.throttle = 0.1;
    for (let i = 0; i < 84; i++) f.step(1 / 120);
    f.throttle = 0.01;
    for (let i = 0; i < 840; i++) f.step(1 / 120);
    f.throttle = 0;
    execute(timedRelativeStopPlan(f, target()), 5.1, true);
    assert.ok(relativeState(f, g).distance > 600 && relativeState(f, g).distance < 700);
    const correction = timedRendezvousTransfer(f, target(), {duration: 120});
    assert.ok(correction.deltaV > 3 && correction.deltaV < 4);
    execute(correction);
    const stop = timedRelativeStopPlan(f, target());
    assert.ok(stop.time > 60);
    execute(stop);
    assert.ok(relativeState(f, g).distance < 100);
    assert.ok(relativeState(f, g).speed < 0.1);
  } finally {
    f.dispose();
  }
});
