import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {PARTS} from '../dist/catalog.js';
import {nodePlacementRotation, symmetryPlacementPoses} from '../dist/placement-poses.js';
import {catalogContractErrors} from '../tools/catalog-contract.mjs';
const legacyWings = new Set(['wing', 'fin', 'wingLarge', 'transportWing', 'transportWingRoot']);
test('declared placement and mirror rotations preserve all legacy catalog poses', () => {
  const parent = new T.Quaternion().setFromEuler(new T.Euler(0.4, -0.8, 1.3));
  for (const type of Object.keys(PARTS)) {
    for (const normal of [
      new T.Vector3(1, 2, 3).normalize(),
      new T.Vector3(-1, 0, 0),
      new T.Vector3(0, 1, 0)
    ]) {
      const expected = legacyWings.has(type)
        ? new T.Quaternion().setFromUnitVectors(new T.Vector3(1, 0, 0), normal)
        : parent;
      assert.ok(nodePlacementRotation(type, normal, parent).angleTo(expected) < 1e-7, type);
    }
    const reflect = new T.Matrix4().makeScale(-1, 1, 1);
    const expected = new T.Quaternion().setFromRotationMatrix(
      new T.Matrix4().makeRotationFromQuaternion(parent).premultiply(reflect).multiply(reflect)
    );
    if (legacyWings.has(type))
      expected.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI));
    assert.ok(
      symmetryPlacementPoses(new T.Vector3(2, 3, 4), parent, 'mirror', 'sph', type)[1].q.angleTo(expected) <
        1e-7,
      type
    );
  }
});
test('placement follows declared node direction independently of wing identity or node position', () => {
  const old = PARTS.truss;
  try {
    PARTS.truss = {
      ...old,
      placementNode: 0,
      attachmentNodes: [[4, -2, 3, 0, 0, -1]],
      mirrorRotation: [Math.PI, 0, 0]
    };
    const normal = new T.Vector3(1, 2, 3).normalize(),
      parent = new T.Quaternion();
    const q = nodePlacementRotation('truss', normal, parent);
    assert.ok(new T.Vector3(0, 0, -1).applyQuaternion(q).dot(normal) < -1 + 1e-10);
    const mirrored = symmetryPlacementPoses(new T.Vector3(), parent, 'mirror', 'sph', 'truss')[1].q;
    assert.ok(mirrored.angleTo(new T.Quaternion().setFromEuler(new T.Euler(Math.PI, 0, 0))) < 1e-7);
    assert.ok(parent.equals(new T.Quaternion()));
  } finally {
    PARTS.truss = old;
  }
});
test('catalog rejects missing placement nodes, invalid rotations and the retired compound flag', () => {
  for (const change of [
    {placementNode: -1},
    {placementNode: 0.5},
    {placementNode: 9},
    {mirrorRotation: [0, 0]},
    {mirrorRotation: [0, NaN, 0]},
    {rootWing: true}
  ])
    assert.ok(catalogContractErrors({bad: {...PARTS.wing, ...change}}).length > 0);
});
