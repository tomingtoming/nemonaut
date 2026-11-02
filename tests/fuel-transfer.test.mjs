import test from 'node:test';
import assert from 'node:assert/strict';
import {preset} from '../dist/catalog.js';
import {Flight, statistics} from '../dist/core.js';
import {transferTargets, transferFuel} from '../dist/fuel-transfer.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import * as T from 'three';
import {PARTS} from '../dist/catalog.js';
import {partMass, partCenter, partRotation} from '../dist/aero.js';
// Independent inertia sum: rotated cuboids plus the parallel-axis contribution.
function momentumOf(f) {
  const com = statistics(f.parts, f.fuel, f.ballast, f.thermal).com,
    result = new T.Vector3();
  for (const p of f.parts) {
    const m = partMass(p, f.fuel, f.ballast, f.thermal),
      d = PARTS[p.type],
      s = d.size,
      q = f.q.clone().multiply(partRotation(p)),
      w = f.omega.clone().applyQuaternion(q.clone().invert()),
      own = d.wheel
        ? new T.Vector3(1, 1, 1).multiplyScalar(0.4 * m * 0.35 ** 2)
        : new T.Vector3(s[1] ** 2 + s[2] ** 2, s[0] ** 2 + s[2] ** 2, s[0] ** 2 + s[1] ** 2).multiplyScalar(
            m / 12
          );
    result.add(w.multiply(own).applyQuaternion(q));
    const r = partCenter(p).sub(com).applyQuaternion(f.q);
    result.add(r.clone().cross(f.omega.clone().cross(r)).multiplyScalar(m));
  }
  return result;
}
test('Off-axis fuel transfer conserves angular momentum across arbitrary attitude and survives restore', () => {
  const f = new Flight(preset('launcher'), 'orbit');
  try {
    f.q.setFromEuler(new T.Euler(0.7, -0.4, 0.8));
    f.omega.set(0.11, -0.07, 0.19);
    const [a, b] = f.networks.groups.find(g => g.tanks.length > 1).tanks;
    f.fuel.set(b.id, 0);
    const before = momentumOf(f),
      omega = f.omega.clone();
    assert.equal(f.transferFuel(a.id, b.id, 700), 700);
    const after = momentumOf(f);
    assert.ok(after.distanceTo(before) / before.length() < 2e-5);
    assert.ok(f.omega.distanceTo(omega) > 1e-4, 'spin changes as inertia changes');
    const restored = loadFlight(saveFlight(f));
    try {
      assert.ok(momentumOf(restored).distanceTo(after) < 1e-7);
    } finally {
      restored.dispose();
    }
    assert.equal(f.transferFuel(b.id, a.id, 700), 700);
    assert.ok(f.omega.distanceTo(omega) < 1e-5, 'round trip restores spin');
    f.omega.set(0, 0, 0);
    f.transferFuel(a.id, b.id, 100);
    assert.equal(f.omega.length(), 0);
  } finally {
    f.dispose();
  }
});
test('Grounded fuel transfer preserves contact-frame position and rotation rate', () => {
  const f = new Flight(preset('launcher'), 'land');
  try {
    f.landed = true;
    const [a, b] = f.networks.groups.find(g => g.tanks.length > 1).tanks;
    f.fuel.set(b.id, 0);
    const pos = f.pos.clone(),
      omega = f.omega.clone();
    assert.equal(f.transferFuel(a.id, b.id, 300), 300);
    assert.ok(f.pos.equals(pos));
    assert.ok(f.omega.equals(omega));
  } finally {
    f.dispose();
  }
});
test('Transfer conserves fuel, clamps at capacity and empty source, and preserves free-flight COM and velocity', () => {
  const f = new Flight(preset('launcher'), 'orbit');
  try {
    const group = f.networks.groups.find(g => g.tanks.length > 1),
      [a, b] = group.tanks;
    f.fuel.set(b.id, 100);
    f.stats = statistics(f.parts, f.fuel, f.ballast, f.thermal);
    const before = f.stats,
      worldCOM = f.pos.clone().add(before.com.clone().applyQuaternion(f.q)),
      vel = f.vel.clone(),
      total = [...f.fuel.values()].reduce((a, b) => a + b, 0);
    assert.equal(f.transferFuel(a.id, b.id, 200), 200);
    assert.equal(f.fuel.get(b.id), 300);
    assert.equal(f.stats.mass, before.mass);
    assert.ok(f.stats.com.distanceTo(before.com) > 0);
    assert.ok(f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)).distanceTo(worldCOM) < 1e-8);
    assert.ok(f.vel.equals(vel));
    assert.ok(Math.abs(f.body.mass() - f.stats.mass) < 0.01);
    assert.equal(f.transferFuel(a.id, b.id, 1e6), 1500);
    assert.equal(f.transferFuel(a.id, b.id, 100), 0);
    assert.equal(
      [...f.fuel.values()].reduce((a, b) => a + b, 0),
      total
    );
    const restored = loadFlight(saveFlight(f));
    try {
      assert.deepEqual([...restored.fuel], [...f.fuel]);
    } finally {
      restored.dispose();
    }
    f.fuel.set(a.id, 0);
    assert.equal(f.transferFuel(a.id, b.id, 100), 0);
  } finally {
    f.dispose();
  }
});
test('Transfer rejects cross-stage, detached, wrong resource, damaged and invalid requests without changes', () => {
  const f = new Flight(preset('launcher'), 'orbit');
  try {
    const [a, b] = f.networks.groups.find(g => g.tanks.length > 1).tanks,
      other = f.parts.find(
        p => p.type === 'tank' && !transferTargets(f, a.id).some(q => q.id === p.id) && p.id !== a.id
      ),
      snapshot = [...f.fuel];
    for (const n of [-1, 0, NaN, Infinity, '100']) assert.equal(transferFuel(f, a.id, b.id, n), 0);
    for (const id of [a.id, 'missing', f.parts.find(p => p.type === 'engine').id, other.id])
      assert.equal(transferFuel(f, a.id, id, 100), 0);
    f.thermal.get(b.id).failed = true;
    assert.equal(transferFuel(f, a.id, b.id, 100), 0);
    f.thermal.get(b.id).failed = false;
    f.crashed = true;
    assert.equal(transferFuel(f, a.id, b.id, 100), 0);
    assert.deepEqual([...f.fuel], snapshot);
    f.crashed = false;
    f.stageNext();
    f.stageNext();
    assert.equal(transferFuel(f, a.id, b.id, 100), 0);
  } finally {
    f.dispose();
  }
});
