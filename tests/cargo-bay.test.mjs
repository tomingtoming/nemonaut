import test from 'node:test';
import assert from 'node:assert/strict';
import {ShapeType} from '../dist/physics.js';
import * as T from 'three';
import {PARTS, preset, part, nodes} from '../dist/catalog.js';
import {Flight, validateCraft, statistics} from '../dist/core.js';
import {nodeConnection} from '../dist/attachment-nodes.js';
import {setPartAction} from '../dist/part-actions.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import {angularMomentum} from '../dist/angular-momentum.js';
import {cargoReleaseAllowed} from '../dist/cargo-access.js';
import {assemblyInterferences} from '../dist/assembly-interference.js';

test('cargo internal mount is a real aligned attachment and survives validation', () => {
  const parts = preset('cargo-lab'),
    bay = parts.find(p => p.type === 'cargoBay'),
    ring = parts.find(p => p.type === 'decoupler');
  assert.equal(nodes(bay.type).length, 9);
  assert.equal(nodeConnection(parts, ring).parentNode, 6);
  assert.deepEqual(validateCraft({version: 1, parts}), parts);
  ring.attachment.parentNode = 9;
  assert.throws(() => validateCraft({version: 1, parts}), /接続点/);
  const invalid = part('probe');
  invalid.cargoOpen = true;
  assert.throws(() => validateCraft({version: 1, parts: [invalid]}), /貨物扉/);
});

test('opening moves roof collisions, preserves COM and angular momentum, and persists', () => {
  let f = new Flight(preset('cargo-lab'), 'orbit');
  try {
    const bay = f.parts.find(p => p.type === 'cargoBay');
    f.omega.set(0.01, 0.02, 0.03);
    const com = statistics(f.parts).com,
      mass = f.body.mass(),
      momentum = angularMomentum(f.body, f.q, f.omega);
    const roofPoint = new T.Vector3(0.37, 0, 2.826)
      .applyQuaternion(new T.Quaternion().copy(f.body.rotation()))
      .add(new T.Vector3().copy(f.body.translation()));
    assert.ok(f.colliderGroups.get(bay.id).some(({collider}) => collider.containsPoint(roofPoint)));
    assert.equal(setPartAction(f, bay.id, 'cargoOpen', true), true);
    assert.ok(f.colliderGroups.get(bay.id).every(({collider}) => !collider.containsPoint(roofPoint)));
    assert.ok(Math.abs(f.body.mass() - mass) < 0.01);
    assert.ok(new T.Vector3().copy(f.body.localCom()).distanceTo(com) < 1e-5);
    assert.ok(angularMomentum(f.body, f.q, f.omega).distanceTo(momentum) < 0.01);
    const restored = loadFlight(saveFlight(f));
    f.dispose();
    f = restored;
    assert.equal(f.parts.find(p => p.id === bay.id).cargoOpen, true);
    assert.equal(f.colliderGroups.get(bay.id).length, 25);
    assert.equal(setPartAction(f, bay.id, 'cargoOpen', false), true);
    assert.equal(f.parts.find(p => p.id === bay.id).cargoOpen, false);
  } finally {
    f.dispose();
  }
});

test('closed bay blocks staged and manual release; open release exits through hatch and restores as two craft', () => {
  let f = new Flight(preset('cargo-lab'), 'orbit');
  try {
    const bay = f.parts.find(p => p.type === 'cargoBay'),
      ring = f.parts.find(p => p.type === 'decoupler');
    assert.equal(f.canDecouplePart(ring.id), false);
    assert.equal(f.decouplePart(ring.id).size, 0);
    f.stageNext();
    f.stageNext();
    assert.equal(f.detached.length, 0);
    setPartAction(f, bay.id, 'cargoOpen', true);
    const mass = f.stats.mass;
    assert.equal(f.canDecouplePart(ring.id), true);
    f.decouplePart(ring.id);
    assert.equal(f.detached.length, 1);
    const child = f.detached[0];
    assert.ok(Math.abs(f.stats.mass + child.stats.mass - mass) < 0.001);
    const direction = new T.Vector3(0, 0, 1).applyQuaternion(f.q);
    assert.ok(child.vel.clone().sub(f.vel).dot(direction) > 0.49);
    f.sas = false;
    child.sas = false;
    for (let i = 0; i < 25 * 120; i++) f.step(1 / 120);
    const point = child.pos
      .clone()
      .add(child.stats.com.clone().applyQuaternion(child.q))
      .sub(f.pos)
      .applyQuaternion(f.q.clone().invert());
    assert.ok(point.z > 3.5, 'payload cleared the opening under simulated motion');
    const restored = loadFlight(saveFlight(f));
    f.dispose();
    f = restored;
    assert.equal(f.detached.length, 1);
    assert.equal(f.detached[0].parts.length, 5);
    assert.equal(f.parts.length, 2);
  } finally {
    f.dispose();
  }
});

test('external separators remain usable with closed cargo doors', () => {
  const bay = part('cargoBay'),
    ring = part('decoupler', [0, -5, 0], [0, 0, 0], bay.id);
  assert.equal(cargoReleaseAllowed([bay, ring], ring), true);
});

test('assembly inspection distinguishes the cargo cavity, walls and moved doors', () => {
  const bay = part('cargoBay'),
    payload = part('probe');
  const bounds = new Map([
    ['probe', new T.Box3(new T.Vector3(-0.625, -0.2, -0.625), new T.Vector3(0.625, 0.2, 0.625))]
  ]);
  assert.equal(assemblyInterferences([bay, payload], bounds).total, 0);
  payload.p = [2.8, 0, 0];
  assert.equal(assemblyInterferences([bay, payload], bounds).total, 1);
  payload.p = [0, 0, 2.8];
  assert.equal(assemblyInterferences([bay, payload], bounds).total, 1);
  bay.cargoOpen = true;
  assert.equal(assemblyInterferences([bay, payload], bounds).total, 0);
  payload.p = [3.4, 0, 2.8];
  assert.equal(assemblyInterferences([bay, payload], bounds).total, 1);
});

test('broad-phase radius follows cargo geometry and separation, and only reads unchanged shapes once', () => {
  const f = new Flight(preset('cargo-lab'), 'orbit');
  function check(v) {
    const original = v.world.exports;
    let reads = 0;
    v.world.exports = {
      ...original,
      shape_get(...args) {
        reads++;
        return original.shape_get(...args);
      }
    };
    try {
      let expected = 0;
      for (let i = 0; i < v.body.numColliders(); i++) {
        const c = v.body.collider(i),
          p = c.translationWrtParent();
        const h =
          c.shapeType() === ShapeType.Ball
            ? [c.radius(), c.radius(), c.radius()]
            : Object.values(c.halfExtents());
        expected = Math.max(expected, Math.hypot(p.x, p.y, p.z) + Math.hypot(...h));
      }
      reads = 0;
      assert.equal(v.world.collisionRadius(), expected);
      assert.ok(reads > 0, 'new geometry was read');
      reads = 0;
      assert.equal(v.world.collisionRadius(), expected);
      assert.equal(reads, 0);
    } finally {
      v.world.exports = original;
    }
  }
  try {
    const bay = f.parts.find(p => p.type === 'cargoBay');
    check(f);
    for (const open of [true, false, true]) {
      assert.ok(setPartAction(f, bay.id, 'cargoOpen', open));
      check(f);
    }
    f.decouplePart(f.parts.find(p => p.type === 'decoupler').id);
    assert.equal(f.detached.length, 1);
    check(f);
    check(f.detached[0]);
  } finally {
    f.dispose();
  }
});
