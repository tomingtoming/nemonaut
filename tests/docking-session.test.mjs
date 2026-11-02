import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {DockingSession} from '../tools/docking-session.mjs';
import {preset} from '../dist/catalog.js';
import {worldFromFlight, flightFromWorld} from '../dist/world-save.js';
import {launchWorld} from '../dist/world-operations.js';
import {withRendezvousTarget} from '../dist/rendezvous-practice.js';
import {loadFlight} from '../dist/flight-save.js';
import {WorldRuntime} from '../dist/world-runtime.js';
import {portGuidance} from '../dist/port-navigation.js';
import {dockingStatus, dockVessels} from '../dist/docking.js';

function fixture(offset = 0, tilt = 0) {
  const f = loadFlight(
    flightFromWorld(
      withRendezvousTarget(
        launchWorld(worldFromFlight(null), {
          parts: preset('orbital-tug'),
          environment: 'orbit',
          name: 'Close approach'
        }),
        {close: true}
      )
    )
  );
  // Explicit initial-condition variation; the session never changes transforms.
  const nav = portGuidance(f, f.dockingPorts.own, f.navigationTarget, f.dockingPorts.target);
  f.pos.addScaledVector(nav.right, offset).addScaledVector(nav.outward, 5);
  const before = portGuidance(f, f.dockingPorts.own, f.navigationTarget, f.dockingPorts.target).own.position;
  f.q.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), tilt));
  f.pos.add(
    before.sub(portGuidance(f, f.dockingPorts.own, f.navigationTarget, f.dockingPorts.target).own.position)
  );
  return f;
}
for (const [offset, tilt] of [
  [0, 0],
  [-5, 0],
  [20, 0],
  [5, 0.5]
])
  test(`front-side RCS session aligns, approaches and allows physical docking from lateral ${offset} m, tilt ${tilt}`, t => {
    let f = fixture(offset, tilt);
    const s = new DockingSession();
    try {
      const target = f.navigationTarget,
        ports = {...f.dockingPorts},
        runtime = new WorldRuntime(f),
        before = [...f.fuel.values()].reduce((a, b) => a + b, 0);
      f.rcsEnabled = false;
      f.portTranslationEnabled = false;
      s.start(f);
      for (let i = 0; i < 900 * 120 && s.owner; i++) {
        const pos = f.pos.clone(),
          vel = f.vel.clone(),
          q = f.q.clone(),
          input = s.step(f, 1 / 120);
        assert.deepEqual(f.pos, pos);
        assert.deepEqual(f.vel, vel);
        assert.deepEqual(f.q, q);
        assert.ok(Object.values(input).every(v => Number.isFinite(v) && Math.abs(v) <= 1));
        runtime.replace(f);
        runtime.step(1 / 120, input);
      }
      assert.equal(s.state, 'complete', s.message);
      assert.equal(f.crashed, false);
      assert.equal(f.rcsEnabled, false);
      assert.equal(f.portTranslationEnabled, false);
      assert.ok(dockingStatus(f, ports.own, target, ports.target).ready);
      assert.ok([...f.fuel.values()].reduce((a, b) => a + b, 0) < before);
      t.diagnostic(
        JSON.stringify({offset, time: s.elapsed, status: dockingStatus(f, ports.own, target, ports.target)})
      );
      f = dockVessels(f, target, ports.own, ports.target);
      assert.equal(f.parts.length, 20);
    } finally {
      f.dispose();
    }
  });
test('RCS session pause, manual release, target loss and fuel loss return control', () => {
  const f = fixture(),
    other = fixture();
  try {
    const s = new DockingSession(),
      prior = {
        sas: f.sas,
        sasMode: f.sasMode,
        rcsEnabled: f.rcsEnabled,
        portTranslationEnabled: f.portTranslationEnabled
      };
    s.start(f);
    assert.deepEqual(s.step(f, 0), {portForward: 0, portRight: 0, portUp: 0});
    assert.equal(s.elapsed, 0);
    s.step(f, 1 / 120);
    s.stop();
    for (const [k, v] of Object.entries(prior)) assert.equal(f[k], v);
    s.start(f);
    s.step(other, 1 / 120);
    assert.equal(s.state, 'cancelled');
    f.rcsEnabled = true;
    s.start(f);
    s.step(f, 1 / 120);
    f.rcsEnabled = false;
    s.step(f, 1 / 120);
    assert.equal(s.state, 'cancelled');
    assert.equal(f.rcsEnabled, false);
    s.start(f);
    const ports = f.dockingPorts;
    f.dockingPorts = null;
    s.step(f, 1 / 120);
    assert.equal(s.state, 'cancelled');
    f.dockingPorts = ports;
    s.start(f);
    for (const p of f.parts) if (p.type === 'rcs') f.fuel.set(p.id, 0);
    s.step(f, 1 / 120);
    assert.equal(s.state, 'failed');
    assert.throws(() => s.start(f), /RCS/);
  } finally {
    f.dispose();
    other.dispose();
  }
});
test('unsafe approach geometry, target spin and main thrust are refused', () => {
  const f = fixture();
  try {
    const s = new DockingSession();
    f.throttle = 0.1;
    assert.throws(() => s.start(f), /主エンジン/);
    f.throttle = 0;
    f.navigationTarget.omega.set(0, 0.05, 0);
    assert.throws(() => s.start(f), /回転/);
    f.navigationTarget.omega.set(0, 0, 0);
    const nav = portGuidance(f, f.dockingPorts.own, f.navigationTarget, f.dockingPorts.target);
    f.pos.addScaledVector(nav.outward, -30);
    assert.throws(() => s.start(f), /正面/);
  } finally {
    f.dispose();
  }
});
