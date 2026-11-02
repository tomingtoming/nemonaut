import test from 'node:test';
import assert from 'node:assert/strict';
import {DockingSession} from '../tools/docking-session.mjs';
import {preset} from '../dist/catalog.js';
import {withRendezvousTarget} from '../dist/rendezvous-practice.js';
import {worldFromFlight, flightFromWorld} from '../dist/world-save.js';
import {launchWorld} from '../dist/world-operations.js';
import {loadFlight, saveFlight} from '../dist/flight-save.js';
import {centerOfVessel, relativeState, setTarget} from '../dist/relative-navigation.js';
import {bodyOrbitState} from '../dist/celestial.js';
import {timedRendezvousTransfer, timedRelativeStopPlan} from '../dist/timed-rendezvous.js';
import {maneuverPreview} from '../dist/maneuver.js';
import {createManeuverNode, validateManeuverNode, maneuverEditValues} from '../dist/maneuver-node.js';
import {RendezvousPlanBinding} from '../dist/rendezvous-burn.js';
import {ManeuverSession} from '../dist/maneuver-controller.js';
import {WorldRuntime} from '../dist/world-runtime.js';
import {advanceCoastFleet} from '../dist/coast-flight.js';
import {portGuidance} from '../dist/port-navigation.js';
import {dockingStatus, dockVessels} from '../dist/docking.js';

function fixture() {
  const f = loadFlight(
    flightFromWorld(
      withRendezvousTarget(
        launchWorld(worldFromFlight(null), {parts: preset('orbital-tug'), environment: 'orbit', name: 'Tug'})
      )
    )
  );
  f.stageNext();
  setTarget(f, f, f.detached[0]);
  return f;
}
function planNode(f, plan) {
  const epoch = plan.epoch ?? plan.location.universalTime;
  const p = maneuverPreview(
      centerOfVessel(f),
      f.vel,
      {universalTime: epoch},
      plan.components,
      f.universalTime
    ),
    binding = new RendezvousPlanBinding();
  binding.remember(f, p, plan.burn);
  return createManeuverNode(p, f.time, binding.options(f, p));
}
function burn(f) {
  const s = new ManeuverSession(),
    runtime = new WorldRuntime(f);
  s.start(f);
  assert.equal(s.plan.startTime, f.maneuver.universalTime, 'already corrected start is not shifted twice');
  let first = null;
  for (let i = 0; i < 360 * 120 && s.owner; i++) {
    s.step(f, 1 / 120);
    if (f.throttle > 0 && first === null) first = f.universalTime;
    runtime.replace(f);
    runtime.step(1 / 120);
  }
  assert.equal(s.state, 'complete', s.message);
  assert.equal(f.throttle, 0);
  assert.ok(first >= s.plan.startTime && first <= s.plan.startTime + 2);
  assert.ok(Math.hypot(...f.maneuver.remaining) <= 0.05);
  return first;
}
for (const burnThrottle of [null, 0.1])
  test(`generated automatic transfer and relative stop hand off to RCS docking (${burnThrottle ?? 'tail'})`, t => {
    let f = fixture();
    try {
      let g = f.navigationTarget;
      const startFuel = [...f.fuel.values()].reduce((a, b) => a + b, 0);
      const p = timedRendezvousTransfer(f, bodyOrbitState(centerOfVessel(g), g.vel, g.universalTime), {
        burnThrottle
      });
      f.maneuver = planNode(f, p);
      const saved = saveFlight(f);
      f.dispose();
      f = loadFlight(saved);
      g = f.navigationTarget;
      assert.equal(f.maneuver.rendezvous.burnThrottle, burnThrottle);
      const start = burn(f);
      const stop = timedRelativeStopPlan(f, bodyOrbitState(centerOfVessel(g), g.vel, g.universalTime), {
        burnThrottle
      });
      f.maneuver = planNode(f, stop);
      const coast = advanceCoastFleet(f, stop.time, {maxSteps: 10000});
      assert.equal(coast.reason, '予定噴射の直前');
      burn(f);
      const relative = relativeState(f, g);
      assert.ok(relative.distance > 40 && relative.distance < 70, `distance ${relative.distance}`);
      assert.ok(relative.speed < 0.1, `speed ${relative.speed}`);
      assert.ok([...f.fuel.values()].reduce((a, b) => a + b, 0) < startFuel);
      t.diagnostic(
        JSON.stringify({start, plannedStart: p.epoch, distance: relative.distance, speed: relative.speed})
      );
      const ai = f.parts.find(p => p.type === 'dockingPort').id,
        bi = g.parts.find(p => p.type === 'dockingPort').id;
      f.dockingPorts = {own: ai, target: bi};
      f.rcsEnabled = true;
      f.sas = true;
      f.sasMode = 'dock';
      f.portTranslationEnabled = true;
      const entry = portGuidance(f, ai, g, bi);
      t.diagnostic(
        JSON.stringify({
          entryAxial: entry.axial,
          entryLateral: entry.lateral,
          entryAngle: entry.angle,
          targetSpin: g.omega.length()
        })
      );
      const docking = new DockingSession(),
        runtime = new WorldRuntime(f);
      let i = 0;
      // Prototype session consumes the actual burn result, without repositioning.
      docking.start(f);
      for (; i < 180 * 120 && docking.owner; i++) {
        const input = docking.step(f, 1 / 120);
        runtime.replace(f);
        runtime.step(1 / 120, input);
      }
      assert.equal(docking.state, 'complete', docking.message);
      assert.ok(i < 180 * 120);
      assert.ok(dockingStatus(f, ai, g, bi).ready);
      assert.ok(dockingStatus(f, ai, g, bi).speed < 0.03);
      const fuelBefore = [...f.fuel.values(), ...g.fuel.values()].reduce((a, b) => a + b, 0);
      f = dockVessels(f, g, ai, bi);
      assert.equal(f.parts.length, 20);
      assert.equal(f.detached.length, 0);
      assert.ok(Math.abs([...f.fuel.values()].reduce((a, b) => a + b, 0) - fuelBefore) < 1e-6);
    } finally {
      f.dispose();
    }
  });

test('timed plan binding, saved contract and target changes never reuse stale guidance', () => {
  const f = fixture();
  try {
    const p = timedRendezvousTransfer(
      f,
      bodyOrbitState(centerOfVessel(f.navigationTarget), f.navigationTarget.vel, 0),
      {burnThrottle: 0.1}
    );
    const preview = maneuverPreview(centerOfVessel(f), f.vel, {universalTime: p.epoch}, p.components, 0),
      b = new RendezvousPlanBinding();
    b.remember(f, preview, p.burn);
    const options = b.options(f, preview);
    assert.equal(options.rendezvous.burnThrottle, 0.1);
    assert.deepEqual(b.options(f, {...preview, universalTime: preview.universalTime + 1}), {});
    assert.deepEqual(b.options(f, {...preview, impulse: preview.impulse.clone().multiplyScalar(2)}), {});
    assert.throws(() => b.options({...f}, preview), /作り直し/);
    b.remember(f, preview, p.burn);
    f.maneuver = createManeuverNode(preview, f.time, options);
    assert.throws(() => maneuverEditValues(f.maneuver, 0), /通常/);
    for (const mutate of [
      n => (n.rendezvous.burnThrottle = 0.2),
      n => (n.rendezvous.duration = NaN),
      n => (n.rendezvous.targetPartId = ''),
      n => (n.plannedThrottle = 0.1),
      n => (n.tolerance = 0.5)
    ]) {
      const bad = structuredClone(f.maneuver);
      mutate(bad);
      assert.throws(() => validateManeuverNode(bad));
    }
    const session = new ManeuverSession();
    session.start(f);
    setTarget(f, f, null);
    session.step(f, 1 / 120);
    assert.equal(session.state, 'cancelled');
    assert.equal(f.throttle, 0);
    assert.throws(() => session.start(f), /目標/);
    assert.throws(() => b.options(f, preview), /作り直し/);
    setTarget(f, f, f.detached[0]);
    assert.throws(() => b.options(f, preview), /作り直し/);
    b.clear();
    assert.deepEqual(b.options(f, preview), {});
  } finally {
    f.dispose();
  }
});
