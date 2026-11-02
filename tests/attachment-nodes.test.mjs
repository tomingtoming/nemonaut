import test from 'node:test';
import assert from 'node:assert/strict';
import {
  occupiedNodes,
  nodeAvailable,
  nodeConnection,
  assertNodeAttachments,
  validateAttachments,
  releaseDisplacedAttachments,
  bindMatchingNode
} from '../dist/attachment-nodes.js';
import {extractBranch, placeBranch, moveBranch} from '../dist/assembly-branch.js';
import {editSymmetryPose} from '../dist/symmetry-geometry.js';
import {validateCraft} from '../dist/core.js';
const part = (id, parent, y) => ({id, type: 'probe', parent, p: [0, y, 0], r: [0, 0, 0], stage: 0});
const joined = () => [
  part('a', null, 0),
  {...part('b', 'a', 0.4), attachment: {mode: 'node', parentNode: 0, ownNode: 1}}
];
test('A joint occupies both endpoints; removing or ignoring its edge frees both', () => {
  const p = joined(),
    used = occupiedNodes(p);
  assert.equal(nodeAvailable(used, 'a', 0), false);
  assert.equal(nodeAvailable(used, 'b', 1), false);
  assert.equal(nodeAvailable(used, 'a', 1), true);
  assert.equal(nodeAvailable(occupiedNodes(p, {ignoreEdges: new Set(['b'])}), 'a', 0), true);
  assert.equal(occupiedNodes(p.slice(0, 1)).size, 0);
  assert.deepEqual(occupiedNodes(JSON.parse(JSON.stringify(p))), used);
});
test('Placement rejects competing nodes atomically, including an occupied child anchor', () => {
  const p = joined(),
    c = {...part('c', 'a', 0.4), attachment: {mode: 'node', parentNode: 0, ownNode: 1}},
    before = structuredClone(p);
  assert.throws(() => assertNodeAttachments([...p, c], ['c']), /使用済み/);
  assert.deepEqual(p, before);
  const child = {...part('d', 'b', 0), attachment: {mode: 'node', parentNode: 1, ownNode: 0}};
  assert.throws(() => assertNodeAttachments([...p, child], ['b']), /使用済み/);
  assert.doesNotThrow(() => assertNodeAttachments(p, ['b']));
});
test('Legacy inference requires exact opposing points and never overrides explicit surface/free modes', () => {
  const p = joined();
  delete p[1].attachment;
  assert.deepEqual(nodeConnection(p, p[1]), {parent: 'a', parentNode: 0, ownNode: 1});
  for (const mode of ['surface', 'free']) {
    p[1].attachment = {mode};
    assert.equal(occupiedNodes(p).size, 0);
  }
  delete p[1].attachment;
  p[1].p[1] += 0.01;
  assert.equal(occupiedNodes(p).size, 0);
});
test('Invalid node IDs fail validation and moving away releases a stored node joint', () => {
  const p = joined();
  p[1].attachment.ownNode = 99;
  assert.throws(() => validateAttachments(p));
  p[1].attachment.ownNode = 1;
  p[1].p[0] = 2;
  assert.throws(() => assertNodeAttachments(p, ['b']), /一致しません/);
  releaseDisplacedAttachments(p);
  assert.equal(p[1].attachment.mode, 'free');
  assert.equal(occupiedNodes(p).size, 0);
});
test('Branch copying and reattachment preserve internal joints and release only the old boundary', () => {
  const p = joined();
  p.push({...part('c', 'b', 0.8), attachment: {mode: 'node', parentNode: 0, ownNode: 1}});
  const before = structuredClone(p),
    branch = extractBranch(p, 'b');
  assert.equal(branch.parts[0].attachment.mode, 'free');
  assert.equal(branch.parts[1].attachment.mode, 'node');
  const pose = {
    position: [1.25, 0, 0],
    rotation: [0, 0, 0],
    parent: 'a',
    attachment: {mode: 'node', parentNode: 2, ownNode: 3}
  };
  const copy = placeBranch(p, branch, pose);
  assert.equal(copy.parts.length, 5);
  assert.equal(occupiedNodes(copy.parts).size, 8);
  assert.throws(
    () =>
      placeBranch(p, branch, {
        position: [0, 0.4, 0],
        rotation: [0, 0, 0],
        parent: 'a',
        attachment: {mode: 'node', parentNode: 0, ownNode: 1}
      }),
    /使用済み/
  );
  const moved = moveBranch(p, 'b', pose).parts;
  assert.deepEqual(p, before);
  const used = occupiedNodes(moved);
  assert.equal(nodeAvailable(used, 'a', 0), true);
  assert.equal(nodeAvailable(used, 'a', 2), false);
  assert.equal(nodeAvailable(used, 'b', 0), false);
  assert.deepEqual(
    occupiedNodes(validateCraft({version: 1, parts: JSON.parse(JSON.stringify(moved))})),
    used
  );
  const shifted = editSymmetryPose(moved, 'b', {position: [2.25, 0, 0], rotation: [0, 0, 0]});
  assert.equal(shifted[1].attachment.mode, 'free');
  assert.equal(shifted[2].attachment.mode, 'node');
  assert.equal(nodeAvailable(occupiedNodes(shifted), 'a', 2), true);
});
test('Symmetric copies bind their actual matching nodes and reject shared or missing targets', () => {
  const parent = part('a', null, 0),
    right = {...part('r', 'a', 0), p: [1.25, 0, 0]},
    left = {...part('l', 'a', 0), p: [-1.25, 0, 0]};
  const r = bindMatchingNode([parent], right),
    l = bindMatchingNode([parent], left);
  assert.equal(r.attachment.parentNode, 2);
  assert.equal(l.attachment.parentNode, 3);
  assert.doesNotThrow(() => assertNodeAttachments([parent, r, l], ['r', 'l']));
  assert.throws(
    () => assertNodeAttachments([parent, r, {...r, id: 'duplicate'}], ['r', 'duplicate']),
    /使用済み/
  );
  assert.throws(() => bindMatchingNode([parent], {...left, p: [-2, 0, 0]}), /取付先/);
  const other = {...parent, id: 'other', p: [-2.5, 0, 0]},
    onOther = {...right, id: 'o', p: [-3.75, 0, 0]};
  assert.equal(bindMatchingNode([parent, other], onOther).parent, 'other');
});
