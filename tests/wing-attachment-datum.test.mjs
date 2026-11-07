import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {PARTS, nodes, part} from '../dist/catalog.js';
import {nodePose, nodeConnection} from '../dist/attachment-nodes.js';
import {installLargeParts} from '../dist/large-parts.js';

test('declared wing endpoints preserve legacy node numbers, positions and normals at every size', () => {
  for (const [type, width] of Object.entries({
    wing: 2,
    fin: 2,
    wingLarge: 6,
    transportWing: 14,
    transportWingRoot: 14
  })) {
    const expected = [
      [0, 0, 0, -1, 0, 0],
      [width, 0, 0, 1, 0, 0]
    ];
    assert.deepEqual(
      PARTS[type].attachmentNodes.map(n => n[0]),
      [-width / 2, width / 2]
    );
    assert.deepEqual(nodes(type), expected);
    const p = part(type, [3, 4, 5], [0.2, -0.8, 1.4]);
    const q = new T.Quaternion().setFromEuler(new T.Euler(...p.r));
    expected.forEach((n, i) => {
      assert.ok(
        nodePose(p, i).position.distanceTo(
          new T.Vector3(...n.slice(0, 3)).applyQuaternion(q).add(new T.Vector3(...p.p))
        ) < 1e-10
      );
      assert.ok(nodePose(p, i).normal.distanceTo(new T.Vector3(...n.slice(3)).applyQuaternion(q)) < 1e-10);
    });
    const copy = nodes(type);
    copy[0][0] = 99;
    assert.deepEqual(nodes(type), expected);
  }
});

test('large variants scale arbitrary attachment points, never normals or source definitions', () => {
  const catalog = structuredClone(PARTS);
  catalog.wing.attachmentNodes = [[0.2, -0.3, 0.4, 0, 0, -1]];
  const before = structuredClone(catalog.wing);
  installLargeParts(catalog);
  for (const [type, scale] of Object.entries({wingLarge: 3, transportWing: 7, transportWingRoot: 7})) {
    const [point] = catalog[type].attachmentNodes;
    point.slice(0, 3).forEach((v, i) => assert.equal(v, before.attachmentNodes[0][i] * scale));
    assert.deepEqual(point.slice(3), [0, 0, -1]);
  }
  assert.deepEqual(catalog.wing, before);
});

test('rebased wing endpoints preserve a rotated tip-to-root joint', () => {
  const parent = part('transportWingRoot', [4, 5, 6], [0.3, -0.4, 0.7]);
  const child = part('transportWing', nodePose(parent, 1).position.toArray(), [...parent.r], parent.id);
  child.attachment = {mode: 'node', parentNode: 1, ownNode: 0};
  assert.deepEqual(nodeConnection([parent, child], child), {parent: parent.id, parentNode: 1, ownNode: 0});
  const types = ['transportWingRoot', 'transportWing'];
  const before = types.map(type => PARTS[type].modelCenter);
  try {
    for (const type of types) delete PARTS[type].modelCenter;
    for (const p of [parent, child]) {
      const offset = new T.Vector3(7, 0, 0).applyEuler(new T.Euler(...p.r));
      p.p = new T.Vector3(...p.p).add(offset).toArray();
    }
    assert.deepEqual(nodeConnection([parent, child], child), {parent: parent.id, parentNode: 1, ownNode: 0});
  } finally {
    types.forEach((type, i) => (PARTS[type].modelCenter = before[i]));
  }
});
