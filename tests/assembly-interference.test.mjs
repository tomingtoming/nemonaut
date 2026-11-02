import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {orientedBounds, overlapDepth, assemblyInterferences} from '../dist/assembly-interference.js';
import {extractBranch, placeBranch} from '../dist/assembly-branch.js';
import {editSymmetryPose} from '../dist/symmetry-geometry.js';
import {placementSymmetryFrame} from '../dist/symmetry.js';
const box = (min, max) => new T.Box3(new T.Vector3(...min), new T.Vector3(...max));
const part = (id, p = [0, 0, 0], r = [0, 0, 0], type = 'cube') => ({id, type, p, r});
const cube = box([-1, -1, -1], [1, 1, 1]);
test('Touching joints and numerical slivers are excluded while intersecting and contained boxes are reported', () => {
  const a = orientedBounds(part('a'), cube);
  for (const x of [2, 3, 1.999]) assert.equal(overlapDepth(a, orientedBounds(part('b', [x, 0, 0]), cube)), 0);
  assert.ok(Math.abs(overlapDepth(a, orientedBounds(part('b', [1.5, 0, 0]), cube)) - 0.5) < 1e-9);
  assert.ok(overlapDepth(a, orientedBounds(part('small'), box([-0.1, -0.1, -0.1], [0.1, 0.1, 0.1]))) > 0);
});
test('Rotated slender parts are separated even when world axis bounds overlap', () => {
  const thin = box([-2, -0.1, -0.1], [2, 0.1, 0.1]),
    angle = Math.PI / 4,
    a = orientedBounds(part('a', [0, 0, 0], [0, 0, angle]), thin),
    b = orientedBounds(part('b', [-0.3, 0.3, 0], [0, 0, angle]), thin);
  assert.ok(a.aabb.intersectsBox(b.aabb));
  assert.equal(overlapDepth(a, b), 0);
  const crossing = orientedBounds(part('c', [0, 0, 0], [0, 0, -angle]), thin);
  assert.ok(overlapDepth(a, crossing) > 0);
});
test('Off-center wing roots and global transforms preserve interference decisions', () => {
  const wing = box([0, -0.5, -0.05], [2, 0.5, 0.05]),
    a = part('a', [0, 0, 0], [0, 0, 0], 'wing'),
    b = part('b', [2, 0, 0], [0, 0, 0], 'wing'),
    bounds = new Map([['wing', wing]]);
  assert.equal(assemblyInterferences([a, b], bounds).total, 0);
  b.p[0] = 1;
  assert.equal(assemblyInterferences([a, b], bounds).total, 1);
  const q = new T.Quaternion().setFromEuler(new T.Euler(0.2, 0.5, 0.7)),
    offset = new T.Vector3(5, 6, 7),
    rotated = [a, b].map(p => {
      const e = new T.Euler().setFromQuaternion(q);
      return {...p, p: new T.Vector3(...p.p).applyQuaternion(q).add(offset).toArray(), r: [e.x, e.y, e.z]};
    });
  assert.equal(assemblyInterferences(rotated, bounds).total, 1);
});
test('Pair totals remain complete when display is limited; changing or deleting a part recomputes without mutation', () => {
  const p = [part('a'), part('b'), part('c')],
    before = structuredClone(p),
    bounds = new Map([['cube', cube]]),
    all = assemblyInterferences(p, bounds, {limit: 1});
  assert.equal(all.total, 3);
  assert.equal(all.pairs.length, 1);
  assert.deepEqual(p, before);
  assert.equal(assemblyInterferences(p.slice(0, 2), bounds).total, 1);
  p[1].p = [5, 0, 0];
  assert.equal(assemblyInterferences(p, bounds).total, 1);
  assert.equal(assemblyInterferences([], bounds).total, 0);
});
test('Actual branch copies and linked symmetry edits produce newly detectable overlaps', () => {
  const make = (id, x, parent = null) => ({...part(id, [x, 0, 0], [0, 0, 0], 'probe'), parent, stage: 0}),
    bounds = new Map([['probe', box([-0.625, -0.2, -0.625], [0.625, 0.2, 0.625])]]);
  const root = make('root', 0),
    left = {
      ...make('left', -2, 'root'),
      symmetryGroup: 'g',
      symmetryFrame: placementSymmetryFrame('mirror', 'vab', 0, 2)
    },
    right = {
      ...make('right', 2, 'root'),
      symmetryGroup: 'g',
      symmetryFrame: placementSymmetryFrame('mirror', 'vab', 1, 2)
    };
  const parts = [root, left, right];
  assert.equal(assemblyInterferences(parts, bounds).total, 0);
  const edited = editSymmetryPose(parts, 'left', {position: [-0.5, 0, 0], rotation: [0, 0, 0]});
  assert.equal(assemblyInterferences(edited, bounds).total, 3);
  const copied = placeBranch(parts, extractBranch(parts, 'left'), {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    parent: 'root'
  }).parts;
  assert.equal(assemblyInterferences(copied, bounds).total, 1);
  assert.equal(assemblyInterferences(parts, bounds).total, 0);
});
