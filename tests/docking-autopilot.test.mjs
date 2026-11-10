import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {DockingAutopilot, segmentClear} from '../dist/docking-autopilot.js';
import {preset} from '../dist/catalog.js';
import {worldFromFlight, flightFromWorld} from '../dist/world-save.js';
import {launchWorld} from '../dist/world-operations.js';
import {withRendezvousTarget} from '../dist/rendezvous-practice.js';
import {loadFlight} from '../dist/flight-save.js';
import {WorldRuntime} from '../dist/world-runtime.js';
import {portGuidance} from '../dist/port-navigation.js';
import {dockingStatus, dockVessels, DOCK_LIMITS} from '../dist/docking.js';
import {VESSEL_COLLISION} from '../dist/vessel-collision.js';

// Orbital tug next to its target; the own port is moved to (axial, horizontal, vertical) in the
// target port frame, keeping the tug's attitude.
function fixture(axial, horizontal, vertical = 0) {
  const f = loadFlight(
    flightFromWorld(
      withRendezvousTarget(
        launchWorld(worldFromFlight(null), {
          parts: preset('orbital-tug'),
          environment: 'orbit',
          name: 'Auto dock'
        }),
        {close: true}
      )
    )
  );
  const nav = portGuidance(f, f.dockingPorts.own, f.navigationTarget, f.dockingPorts.target);
  const goal = nav.target.position
    .clone()
    .addScaledVector(nav.outward, axial)
    .addScaledVector(nav.right, horizontal)
    .addScaledVector(nav.top, vertical);
  f.pos.add(goal.sub(nav.own.position));
  return f;
}
function fly(f, limit = 1800) {
  const pilot = new DockingAutopilot(),
    runtime = new WorldRuntime(f),
    contacts = [],
    states = new Set();
  VESSEL_COLLISION.onContact = e => contacts.push(e);
  try {
    const target = f.navigationTarget,
      ports = {...f.dockingPorts};
    pilot.start(f);
    for (let i = 0; i < limit * 120 && pilot.active && pilot.state !== 'docking'; i++) {
      const input = pilot.step(f, 1 / 120);
      states.add(pilot.state);
      assert.ok(Object.values(input).every(v => Number.isFinite(v) && Math.abs(v) <= 1));
      runtime.replace(f);
      runtime.step(1 / 120, input);
    }
    return {
      pilot,
      target,
      ports,
      contacts,
      states,
      status: dockingStatus(f, ports.own, target, ports.target)
    };
  } finally {
    VESSEL_COLLISION.onContact = null;
  }
}
for (const [name, axial, horizontal, vertical] of [
  ['in front', 30, 0, 0],
  ['25 m to the side (the sprint 290 arrival)', 10, 25, 0],
  ['behind the target', -15, 3, 2]
])
  test('automatic docking from ' + name + ' reaches the docking condition without touching the target', t => {
    const f = fixture(axial, horizontal, vertical);
    try {
      const r = fly(f);
      assert.equal(r.pilot.state, 'docking', r.pilot.message);
      assert.ok(r.status.ready, JSON.stringify(r.status));
      assert.equal(
        r.contacts.length,
        0,
        'never touches the target outside the facing ports: ' + JSON.stringify(r.contacts.slice(0, 2))
      );
      assert.ok(
        r.status.speed <= DOCK_LIMITS.speed && r.pilot.peak.speed <= 1.5,
        'gentle: ' + r.pilot.peak.speed
      );
      if (axial < 0 || horizontal > 10) assert.ok(r.states.has('routing'), 'moved around the target');
      t.diagnostic(
        JSON.stringify({
          time: +r.pilot.elapsed.toFixed(1),
          peak: +r.pilot.peak.speed.toFixed(2),
          states: [...r.states]
        })
      );
      const docked = dockVessels(f, r.target, r.ports.own, r.ports.target);
      assert.equal(docked.parts.length, 20);
      docked.dispose();
    } catch (e) {
      f.dispose();
      throw e;
    }
  });
test('manual piloting settings cancel the autopilot and restore the previous settings', () => {
  const f = fixture(30, 0);
  try {
    f.sas = false;
    f.rcsEnabled = false;
    const pilot = new DockingAutopilot(),
      runtime = new WorldRuntime(f);
    pilot.start(f);
    for (let i = 0; i < 240; i++) {
      runtime.replace(f);
      runtime.step(1 / 120, pilot.step(f, 1 / 120));
    }
    assert.equal(pilot.active, true);
    f.sasMode = 'hold';
    pilot.step(f, 1 / 120);
    assert.equal(pilot.state, 'cancelled');
    assert.equal(f.sasMode, 'hold', 'the pilot keeps the change the player made');
    assert.equal(f.rcsEnabled, false, 'other settings return to before');
  } finally {
    f.dispose();
  }
});
test('a completed automatic docking leaves RCS as it was before the autopilot switched it on', () => {
  for (const before of [false, true]) {
    const f = fixture(30, 0);
    let docked = null;
    try {
      f.rcsEnabled = before;
      const r = fly(f);
      assert.equal(r.pilot.state, 'docking', r.pilot.message);
      assert.equal(f.rcsEnabled, true, 'the autopilot flies on RCS');
      docked = dockVessels(f, r.target, r.ports.own, r.ports.target);
      assert.equal(docked.rcsEnabled, true, 'the coupled vessel copies the owner');
      r.pilot.step(docked, 1 / 120);
      assert.equal(r.pilot.state, 'complete');
      assert.equal(docked.rcsEnabled, before);
    } finally {
      (docked ?? f).dispose();
    }
  }
});
test('start refuses unsafe conditions', () => {
  const f = fixture(30, 0);
  try {
    f.throttle = 0.5;
    assert.throws(() => new DockingAutopilot().start(f), /主エンジン/);
    f.throttle = 0;
    f.vel.add(new T.Vector3(3, 0, 0));
    assert.throws(() => new DockingAutopilot().start(f), /1 m\/s/);
  } finally {
    f.dispose();
  }
});
test('the straight-segment clearance check', () => {
  const c = new T.Vector3();
  assert.equal(segmentClear(new T.Vector3(-10, 0, 0), new T.Vector3(10, 0, 0), c, 5), false);
  assert.equal(segmentClear(new T.Vector3(-10, 6, 0), new T.Vector3(10, 6, 0), c, 5), true);
});
