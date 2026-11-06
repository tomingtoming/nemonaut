import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {PARTS, nodes, nodePoint, part} from '../dist/catalog.js';
import {partCenter, aeroPoint} from '../dist/aero.js';
import {nodePose} from '../dist/attachment-nodes.js';
import {partPointToVessel, vesselPointToPart, partDirectionToVessel} from '../dist/part-frame.js';

test('all catalog datums transform nodes, mass centres and aero centres with the saved pose', () => {
  for (const [type, d] of Object.entries(PARTS)) {
    const p = part(type, [7, -3, 11], [0.7, -0.9, 1.2]);
    const q = new T.Quaternion().setFromEuler(new T.Euler(...p.r));
    const matrix = new T.Matrix4().compose(new T.Vector3(...p.p), q, new T.Vector3(1, 1, 1));
    const transform = point => new T.Vector3(...point).applyMatrix4(matrix);
    assert.ok(partCenter(p).distanceTo(transform(d.massCenter || [0, 0, 0])) < 1e-10, type);
    assert.ok(aeroPoint(p).distanceTo(transform(d.ac || [0, 0, 0])) < 1e-10, type);
    for (const [index, node] of nodes(type).entries()) {
      const local = nodePoint(node),
        world = partPointToVessel(p, local),
        before = world.clone();
      assert.ok(nodePose(p, index).position.distanceTo(transform(local)) < 1e-10, type);
      assert.ok(vesselPointToPart(p, world).distanceTo(new T.Vector3(...local)) < 1e-10, type);
      assert.ok(world.equals(before), 'inverse must not mutate its argument');
    }
  }
});

test('rebasing a datum preserves every authored point only when pose and offsets move together', () => {
  for (const [type, d] of Object.entries(PARTS)) {
    const p = part(type, [4, 5, 6], [-0.4, 0.8, 1.3]);
    const delta = new T.Vector3(0.3, -0.2, 0.7);
    const shifted = {...p, p: partPointToVessel(p, delta.toArray()).toArray()};
    const points = [[0, 0, 0], d.massCenter || [0, 0, 0], d.ac || [0, 0, 0], ...nodes(type).map(nodePoint)];
    if (d.surfaceMount) points.push(d.surfaceMount.slice(0, 3));
    for (const point of points) {
      const offset = new T.Vector3(...point).sub(delta).toArray();
      assert.ok(partPointToVessel(p, point).distanceTo(partPointToVessel(shifted, offset)) < 1e-10, type);
    }
    assert.ok(
      partPointToVessel(p, [0, 0, 0]).distanceTo(partPointToVessel(shifted, [0, 0, 0])) > 0.5,
      'changing only the saved pose must be distinguishable'
    );
    assert.ok(
      partDirectionToVessel(p, [0, 1, 0]).distanceTo(partDirectionToVessel(shifted, [0, 1, 0])) < 1e-12
    );
  }
});
