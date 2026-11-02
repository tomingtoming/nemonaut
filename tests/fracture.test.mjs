import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Flight, statistics, validateCraft} from '../dist/core.js';
import {part, preset} from '../dist/catalog.js';
import {fractureComponents, fractureVessel} from '../dist/fracture.js';
import {fleet, canControl} from '../dist/fleet.js';
import {recordFailure} from '../dist/failure-events.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import {WorldRuntime} from '../dist/world-runtime.js';
import {surfaceVelocity} from '../dist/surface-frame.js';
const split = (f, ids) => fractureVessel(f, ids, (p, e, t) => new Flight(p, e, t), statistics);
test('failed joint separates branches, preserves part identities and leaves a controllable capsule', () => {
  const f = new Flight(preset('rocket'), 'orbit');
  try {
    const tank = f.parts.find(p => p.type === 'tank'),
      ids = f.parts.map(p => p.id),
      before = f.stats.mass;
    const fuel = f.fuel.get(tank.id);
    recordFailure(f, tank, 'thermal');
    split(f, [tank.id]);
    assert.ok(canControl(f));
    assert.ok(f.parts.some(p => p.type === 'capsule'));
    assert.equal(f.throttle, 0);
    const vessels = fleet(f);
    assert.deepEqual(vessels.flatMap(v => v.parts.map(p => p.id)).sort(), ids.sort());
    const wreck = vessels.find(v => v.parts.some(p => p.id === tank.id));
    assert.equal(wreck.failureDynamics, true);
    assert.equal(canControl(wreck), false);
    assert.equal(wreck.fuel.get(tank.id), 0);
    assert.ok(Math.abs(vessels.reduce((n, v) => n + v.stats.mass, 0) - (before - fuel)) < 1e-6);
    for (const v of vessels) validateCraft({version: 1, parts: v.parts});
    const restored = loadFlight(saveFlight(f));
    try {
      assert.equal(fleet(restored).filter(v => v.failureDynamics).length, 1);
      assert.ok(canControl(restored));
    } finally {
      restored.dispose();
    }
  } finally {
    f.dispose();
  }
});
test('dry breakup preserves linear momentum and point velocities under spin', () => {
  const f = new Flight(preset('rocket'), 'orbit');
  try {
    for (const id of f.fuel.keys()) f.fuel.set(id, 0);
    f.stats = statistics(f.parts, f.fuel, f.ballast, f.thermal);
    f.omega.set(0.1, 0.2, 0.3);
    const before = f.vel.clone().multiplyScalar(f.stats.mass),
      ids = f.parts.map(p => p.id),
      tank = f.parts.find(p => p.type === 'tank');
    split(f, [tank.id]);
    const actual = fleet(f).reduce((p, v) => p.addScaledVector(v.vel, v.stats.mass), new T.Vector3());
    assert.ok(actual.distanceTo(before) < 1e-6);
    const runtime = new WorldRuntime(f),
      wreck = fleet(f).find(v => v.failureDynamics),
      pos = wreck.pos.clone();
    runtime.step(1 / 120);
    assert.equal(runtime.vessels.size, fleet(f).length);
    assert.ok(wreck.pos.distanceTo(pos) > 1);
    assert.ok(fleet(f).every(v => v.universalTime === f.universalTime));
    assert.equal(new Set(fleet(f).flatMap(v => v.parts.map(p => p.id))).size, ids.length);
  } finally {
    f.dispose();
  }
});
test('partitioning a failed leaf keeps sibling wings attached and failed control stays uncommandable', () => {
  const root = part('probe', [0, 0, 0]),
    left = part('wing', [-2, 0, 0], [0, 0, 0], root.id),
    right = part('wing', [2, 0, 0], [0, 0, 0], root.id),
    parts = [root, left, right];
  const groups = fractureComponents(parts, [left.id]);
  assert.equal(groups.length, 2);
  assert.ok(
    groups.some(c => !c.wreck && c.parts.some(p => p.id === right.id) && c.parts.some(p => p.id === root.id))
  );
  const f = new Flight(parts, 'orbit');
  try {
    split(f, [root.id]);
    assert.equal(canControl(f), false);
    assert.equal(f.failureDynamics, true);
  } finally {
    f.dispose();
  }
});
test('aerodynamic overload actually breaks an exposed wing while ordinary flow does not', () => {
  for (const speed of [20, 500]) {
    const root = part('probe', [0, 0, 0]),
      wing = part('wing', [2, 0, 0], [0, 0, 0], root.id),
      f = new Flight([root, wing], 'land');
    try {
      // Explicit initial-condition fixture: broadside flow at 200 m altitude.
      f.pos.y = 200;
      f.vel.copy(surfaceVelocity(f.pos)).add(new T.Vector3(0, 0, speed));
      const runtime = new WorldRuntime(f);
      runtime.step(1 / 120);
      assert.equal(
        f.parts.some(p => p.id === wing.id),
        speed === 20
      );
      assert.equal(canControl(f), true);
      if (speed === 500) {
        assert.equal(f.failureEvents[0].cause, 'structural');
        assert.equal(runtime.vessels.size, 2);
        assert.equal(f.detached[0].failureDynamics, true);
      }
    } finally {
      f.dispose();
    }
  }
});
