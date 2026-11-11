import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {PARTS, part, preset} from '../dist/catalog.js';
import {Flight, statistics} from '../dist/core.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import {partCenter, partRotation} from '../dist/aero.js';
import RAPIER from '@dimforge/rapier3d-compat';
import P from '../dist/physics.js';
import {createPartColliders} from '../dist/part-colliders.js';

await RAPIER.init();

test('hollow part preserves cavity, rotated wall positions, mass and COM across rebuild and save', () => {
  const original = PARTS.tank;
  // Four non-overlapping walls around a passage along the local Y axis.
  PARTS.tank = {
    ...original,
    size: [4, 6, 4],
    collisionBoxes: [
      {center: [-1.75, 0, 0], size: [0.5, 6, 4]},
      {center: [1.75, 0, 0], size: [0.5, 6, 4]},
      {center: [0, 0, -1.75], size: [3, 6, 0.5]},
      {center: [0, 0, 1.75], size: [3, 6, 0.5]}
    ]
  };
  let f;
  try {
    const p = part('tank', [3, 2, -4], [0.3, 0.7, -0.4], null, 0);
    f = new Flight([p], 'orbit');
    const check = () => {
      assert.equal(f.body.numColliders(), 4);
      const expected = statistics(f.parts, f.fuel, f.ballast, f.thermal);
      assert.ok(Math.abs(f.body.mass() - expected.mass) < 0.01);
      assert.ok(new T.Vector3().copy(f.body.localCom()).distanceTo(expected.com) < 1e-5);
      const group = f.colliderGroups.get(p.id);
      const bodyPosition = new T.Vector3().copy(f.body.translation());
      const bodyRotation = new T.Quaternion().copy(f.body.rotation());
      const center = partCenter(p).applyQuaternion(bodyRotation).add(bodyPosition);
      assert.ok(
        group.every(({collider}) => !collider.containsPoint(center)),
        'cavity must not be solid'
      );
      group.forEach(({collider}, i) => {
        const local = new T.Vector3(...PARTS.tank.collisionBoxes[i].center)
          .applyQuaternion(partRotation(p))
          .add(partCenter(p));
        assert.ok(new T.Vector3().copy(collider.translationWrtParent()).distanceTo(local) < 1e-5);
        assert.ok(
          collider.containsPoint(local.applyQuaternion(bodyRotation).add(bodyPosition)),
          'wall material must collide'
        );
      });
    };
    check();
    f.fuel.set(p.id, 123);
    f.updateColliderMasses();
    check();
    f.buildColliders();
    check();
    assert.equal(f.body.numColliders(), 4, 'no orphaned walls after rebuild');
    const loaded = loadFlight(saveFlight(f));
    f.dispose();
    f = loaded;
    check();
    // Geometry oracle: the same walls (read back from the game's colliders) on a fixed JS Rapier
    // body, with free balls dropped through the opening and onto a wall by JS Rapier's own solver.
    const upright = new Flight([part('tank', [0, 0, 0], [0, 0, 0], null, 0)], 'orbit');
    const walls = upright.colliderGroups
      .values()
      .next()
      .value.map(({collider}) => ({
        t: collider.translationWrtParent(),
        q: collider.rotationWrtParent(),
        h: collider.halfExtents()
      }));
    upright.dispose(); // collider poses are relative to the design origin
    const world = new RAPIER.World({x: 0, y: -9.81, z: 0});
    try {
      const frame = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      for (const w of walls)
        world.createCollider(
          RAPIER.ColliderDesc.cuboid(w.h.x, w.h.y, w.h.z)
            .setTranslation(w.t.x, w.t.y, w.t.z)
            .setRotation(w.q),
          frame
        );
      const drop = x => {
        const body = world.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic().setTranslation(x, 4, 0).setCcdEnabled(true)
        );
        world.createCollider(RAPIER.ColliderDesc.ball(0.2).setMass(1), body);
        return body;
      };
      const inside = drop(0),
        wall = drop(1.75);
      for (let i = 0; i < 120; i++) world.step();
      assert.ok(inside.translation().y < -5, 'payload passes through the hollow opening');
      assert.ok(Math.abs(wall.translation().y - 3.2) < 0.03, 'wall supports a colliding payload');
    } finally {
      world.free();
    }
  } finally {
    f?.dispose();
    PARTS.tank = original;
  }
});

test('compound definition rejects a mass center that disagrees with flight statistics', () => {
  const original = PARTS.tank;
  PARTS.tank = {...original, collisionBoxes: [{center: [1, 0, 0], size: [1, 1, 1]}]};
  // Validate through the helper on an owned world so failure is disposed as well.
  const world = new P.World({x: 0, y: 0, z: 0});
  try {
    const body = world.createRigidBody(P.RigidBodyDesc.dynamic());
    assert.throws(() => createPartColliders(world, body, part('tank'), 100), /mass center/);
    assert.equal(body.numColliders(), 0);
  } finally {
    world.free();
    PARTS.tank = original;
  }
});

test('Asymmetric tank depletion updates each collider and COM from its own remaining fuel', () => {
  const f = new Flight(preset('launcher'), 'orbit'),
    tanks = f.parts.filter(p => PARTS[p.type].fuel);
  try {
    f.fuel.set(tanks[0].id, 0);
    f.fuel.set(tanks[1].id, 100);
    const expected = statistics(f.parts, f.fuel);
    f.step(1 / 120);
    assert.ok(f.stats.com.distanceTo(expected.com) < 1e-9);
    assert.ok(Math.abs(f.colliders.get(tanks[0].id).mass() - PARTS[tanks[0].type].mass) < 0.001);
    assert.ok(Math.abs(f.colliders.get(tanks[1].id).mass() - PARTS[tanks[1].type].mass - 100) < 0.001);
  } finally {
    f.dispose();
  }
});
