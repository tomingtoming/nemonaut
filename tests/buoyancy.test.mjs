import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {buoyancyBalance, displacedVolume, waterResistance, planingForce} from '../dist/buoyancy.js';
import {preset} from '../dist/catalog.js';
import {statistics} from '../dist/core.js';
test('planing pressure supports an entering bottom without propelling it or lifting a submerged hull', () => {
  const p = {type: 'pontoon'},
    q = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2),
    up = new T.Vector3(0, 1, 0),
    velocity = new T.Vector3(0, -2, 35),
    force = planingForce(p, q, velocity, up, 0.5);
  assert.ok(force.y > 0);
  assert.ok(force.dot(velocity) <= 0);
  assert.equal(planingForce(p, q, velocity, up, 0).length(), 0);
  assert.equal(planingForce(p, q, velocity, up, 1).length(), 0);
  assert.equal(planingForce(p, q, new T.Vector3(0, 2, 35), up, 0.5).length(), 0);
  assert.equal(planingForce(p, q, new T.Vector3(), up, 0.5).length(), 0);
  assert.equal(planingForce(p, q, velocity, up.clone().negate(), 0.5).length(), 0);
  assert.equal(planingForce({type: 'tank'}, q, velocity, up, 0.5).length(), 0);
  assert.ok(
    Math.abs(planingForce({type: 'hullLarge'}, q, velocity, up, 0.5).length() / force.length() - 16) < 1e-10
  );
});
test('hull water resistance follows part rotation, dissipates energy and vanishes out of water', () => {
  for (const type of ['pontoon', 'hullLarge']) {
    const p = {type},
      q = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2);
    const forward = new T.Vector3(0, 0, 10),
      sideways = new T.Vector3(10, 0, 0);
    const drag = waterResistance(p, q, forward, 1),
      sideDrag = waterResistance(p, q, sideways, 1);
    assert.ok(Math.abs(drag.length() / sideDrag.length() - 0.1) < 1e-10);
    assert.ok(drag.dot(forward) < 0);
    assert.deepEqual(forward.toArray(), [0, 0, 10]);
    assert.equal(waterResistance(p, q, forward, 0).length(), 0);
    const rotatedVelocity = new T.Vector3(2, 3, 4).applyQuaternion(q);
    const rotatedForce = waterResistance(p, new T.Quaternion(), new T.Vector3(2, 3, 4), 0.5).applyQuaternion(
      q
    );
    assert.ok(waterResistance(p, q, rotatedVelocity, 0.5).distanceTo(rotatedForce) < 1e-8);
  }
});
test('Design buoyancy tracks ballast mass without changing volume or the design', () => {
  const parts = preset('sub'),
    before = structuredClone(parts),
    empty = buoyancyBalance(parts, 0),
    full = buoyancyBalance(parts, 1);
  assert.ok(empty.mass < empty.displacement);
  assert.ok(full.mass > full.displacement);
  assert.equal(empty.volume, full.volume);
  assert.deepEqual(empty.center, full.center);
  assert.equal(full.mass - empty.mass, 2100);
  assert.ok(empty.com.distanceTo(full.com) > 0.03);
  for (const ballast of [0, 0.25, 0.5, 1]) {
    const b = buoyancyBalance(parts, ballast),
      st = statistics(parts, 1, ballast);
    assert.equal(b.mass, st.mass);
    assert.ok(b.com.distanceTo(st.com) < 1e-12);
  }
  assert.deepEqual(parts, before);
  assert.deepEqual(buoyancyBalance([]).center.toArray(), [0, 0, 0]);
});
test('Buoyancy accounts for rotated offset centers and follows rigid translation', () => {
  const parts = preset('plane'),
    b = buoyancyBalance(parts),
    shift = new T.Vector3(4, -2, 7),
    moved = parts.map(p => ({...p, p: new T.Vector3(...p.p).add(shift).toArray()})),
    next = buoyancyBalance(moved);
  assert.ok(next.center.distanceTo(b.center.clone().add(shift)) < 1e-10);
  assert.ok(next.com.distanceTo(b.com.clone().add(shift)) < 1e-10);
  assert.equal(next.volume, b.volume);
  assert.ok(parts.every(p => displacedVolume(p) > 0));
  const wing = parts.find(p => p.type === 'wing');
  if (wing) {
    const a = buoyancyBalance([wing]),
      rotated = buoyancyBalance([{...wing, r: [0, 0, Math.PI / 2]}]);
    assert.ok(a.center.distanceTo(rotated.center) > 0.01);
  }
});
