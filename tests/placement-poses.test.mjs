import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {PARTS} from '../dist/catalog.js';
import {catalogContractErrors} from '../tools/catalog-contract.mjs';
import {symmetryPlacementPoses, surfacePlacementPose} from '../dist/placement-poses.js';
import {placementSymmetryFrame} from '../dist/symmetry.js';
test('Placement transforms match saved symmetry frames for every radial count and both bays', () => {
  const p = new T.Vector3(3, 4, 5),
    q = new T.Quaternion().setFromEuler(new T.Euler(0.2, 0.4, 0.6));
  for (const bay of ['vab', 'sph'])
    for (const count of [1, 2, 3, 4, 6, 8]) {
      const poses = symmetryPlacementPoses(p, q, String(count), bay, 'engine');
      assert.equal(poses.length, count);
      for (let i = 0; i < count; i++) {
        const frame = new T.Matrix4().fromArray(placementSymmetryFrame(String(count), bay, i, count));
        assert.ok(poses[i].pos.distanceTo(p.clone().applyMatrix4(frame)) < 1e-8);
        const expected = new T.Quaternion().setFromRotationMatrix(frame).multiply(q);
        assert.ok(poses[i].q.angleTo(expected) < 1e-7);
      }
    }
  assert.deepEqual(p.toArray(), [3, 4, 5]);
});
test('Mirror placement preserves handedness, and rejects invalid counts without touching the source', () => {
  const p = new T.Vector3(3, 4, 5),
    q = new T.Quaternion().setFromEuler(new T.Euler(0.2, 0.4, 0.6)),
    original = q.clone(),
    r = new T.Matrix4().makeScale(-1, 1, 1);
  for (const type of ['engine', 'wing']) {
    const [a, b] = symmetryPlacementPoses(p, q, 'mirror', 'sph', type);
    assert.deepEqual(b.pos.toArray(), [-3, 4, 5]);
    const expected = new T.Matrix4().makeRotationFromQuaternion(q).premultiply(r).multiply(r);
    if (type === 'wing') expected.multiply(new T.Matrix4().makeRotationY(Math.PI));
    assert.ok(b.q.angleTo(new T.Quaternion().setFromRotationMatrix(expected)) < 1e-7);
    a.pos.x = 99;
    assert.equal(p.x, 3);
    assert.ok(q.equals(original));
  }
  assert.throws(() => symmetryPlacementPoses(p, q, '7', 'vab', 'engine'));
});

test('declared surface mounts preserve every existing part pose for oblique and axial hits', () => {
  const point = new T.Vector3(2, 3, 4);
  for (const [type, d] of Object.entries(PARTS))
    for (const values of [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
      [1, 2, 3]
    ]) {
      const normal = new T.Vector3(...values).normalize();
      const oldQ = new T.Quaternion().setFromUnitVectors(
        new T.Vector3(
          ...(['wing', 'fin', 'wingLarge', 'transportWing', 'transportWingRoot'].includes(type)
            ? [1, 0, 0]
            : [0, 1, 0])
        ),
        normal
      );
      const oldPos = point.clone();
      if (!['wing', 'fin', 'wingLarge', 'transportWing', 'transportWingRoot'].includes(type))
        oldPos.addScaledVector(normal, d.size[1] / 2);
      const pose = surfacePlacementPose(type, point, normal);
      assert.ok(pose.pos.distanceTo(oldPos) < 1e-9, type);
      assert.ok(pose.q.angleTo(oldQ) < 1e-7, type);
      assert.deepEqual(point.toArray(), [2, 3, 4]);
      assert.ok(normal.distanceTo(new T.Vector3(...values).normalize()) < 1e-12);
    }
});

test('off-center surface anchors work without a wing flag and invalid mounts are rejected', () => {
  const previous = PARTS.truss.surfaceMount;
  try {
    PARTS.truss.surfaceMount = [0.2, 0.3, -0.4, 0, 0, -1];
    const point = new T.Vector3(3, 4, 5),
      normal = new T.Vector3(1, 2, 3).normalize();
    const pose = surfacePlacementPose('truss', point, normal);
    assert.ok(new T.Vector3(0.2, 0.3, -0.4).applyQuaternion(pose.q).add(pose.pos).distanceTo(point) < 1e-9);
    assert.ok(new T.Vector3(0, 0, -1).applyQuaternion(pose.q).dot(normal) < -1 + 1e-9);
    for (const surfaceMount of [
      [0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 2, 0],
      [0, NaN, 0, 0, 1, 0],
      [0, 0, 0]
    ])
      assert.ok(
        catalogContractErrors({bad: {...PARTS.truss, surfaceMount}}).some(e => e.includes('surfaceMount'))
      );
  } finally {
    if (previous === undefined) delete PARTS.truss.surfaceMount;
    else PARTS.truss.surfaceMount = previous;
  }
});
