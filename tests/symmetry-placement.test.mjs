import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {PARTS, preset} from '../dist/catalog.js';
import {examples} from '../dist/examples.js';
import {validateCraft, descendants} from '../dist/core.js';
import {saveCraft, loadCraft} from '../dist/craft-save.js';
import {bindMatchingNode, assertNodeAttachments, nodePose} from '../dist/attachment-nodes.js';
import {symmetryPlacementPoses} from '../dist/placement-poses.js';
import {
  placementSymmetryFrame,
  hasSymmetryGeometry,
  symmetryTargets,
  normalizeSymmetry,
  editSymmetrySetting
} from '../dist/symmetry.js';
import {editSymmetryPose} from '../dist/symmetry-geometry.js';
import {extractBranch, placeBranch, moveBranch} from '../dist/assembly-branch.js';
import {
  parentSymmetryAxis,
  parentMirrorNormal,
  symmetryCopies,
  symmetricParts,
  symmetryCounterparts
} from '../dist/symmetry-placement.js';

const quat = r => new T.Quaternion().setFromEuler(new T.Euler(...r));
const matrix = p => new T.Matrix4().compose(new T.Vector3(...p.p), quat(p.r), new T.Vector3(1, 1, 1));
const part = (id, type, p, r = [0, 0, 0], parent = null) => ({id, type, p, r, parent, stage: 0});
const ids = (prefix = 'n') => {
  let n = 0;
  return () => prefix + n++;
};
const source = (pos, r = [0, 0, 0], parent = null, attachment = {mode: 'surface'}) => ({
  pos: new T.Vector3(...pos),
  q: quat(r),
  parent,
  attachment
});
/** Pose of `p` in the frame of `parent` as 16 numbers, for comparing arrangements on different parents. */
const relative = (parent, p) => matrix(parent).invert().multiply(matrix(p)).toArray();
function near(a, b, tolerance = 1e-7, label = '') {
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++)
    assert.ok(Math.abs(a[i] - b[i]) < tolerance, `${label} ${i}: ${a[i]} != ${b[i]}`);
}
/** Distance from the axis and angle about it (degrees, from `reference`) of a point. */
function polar(axis, point, reference) {
  const d = point.clone().sub(axis.origin),
    along = d.dot(axis.direction),
    radial = d.clone().addScaledVector(axis.direction, -along),
    ref = reference.clone().sub(axis.origin);
  ref.addScaledVector(axis.direction, -ref.dot(axis.direction));
  const angle = Math.atan2(ref.clone().cross(radial).dot(axis.direction), ref.dot(radial));
  return {along, radius: radial.length(), angle: ((((angle * 180) / Math.PI) % 360) + 360) % 360};
}
/** What the workshop created for one click before the symmetry-axis choice existed. */
function referencePlacement(parts, type, pending, sym, bay, makeId) {
  const count = sym === 'mirror' ? 2 : +sym;
  if (parts.length + count > 400) throw Error('部品上限は400です');
  let created = [];
  for (const {pos, q} of symmetryPlacementPoses(pending.pos, pending.q, sym, bay, type)) {
    const e = new T.Euler().setFromQuaternion(q);
    created.push({
      id: makeId(),
      type,
      p: pos.toArray(),
      r: [e.x, e.y, e.z],
      parent: pending.parent,
      stage: 0,
      attachment: structuredClone(pending.attachment)
    });
  }
  if (pending.attachment.mode === 'node') {
    created = created.map(p => bindMatchingNode(parts, p));
    assertNodeAttachments(
      [...parts, ...created],
      created.map(p => p.id)
    );
  }
  if (count > 1) {
    const group = makeId();
    for (let i = 0; i < created.length; i++) {
      created[i].symmetryGroup = group;
      created[i].symmetryFrame = placementSymmetryFrame(sym, bay, i, count);
    }
  }
  return created;
}
/** A core with `count` side tanks placed with vessel symmetry (surface mounted). */
function boosters(mode = '4', bay = 'vab') {
  const upright = bay === 'vab' ? [0, 0, 0] : [Math.PI / 2, 0, 0],
    core = part('core', 'tank', [0, 0, 0], upright),
    side = symmetricParts(
      [core],
      'tank',
      source(bay === 'vab' ? [2, 0.3, 0.5] : [2, 0.5, 0.3], upright, 'core'),
      mode,
      bay,
      'vessel',
      ids('b')
    );
  return validateCraft({version: 1, parts: [core, ...side]});
}

test('The parent axis comes from the first attachment node: local Y for stack parts, the span for wings', () => {
  const r = [0.3, -0.5, 0.2];
  for (const type of ['tank', 'tankLarge', 'engine', 'wheel', 'truss', 'decoupler', 'probe']) {
    const axis = parentSymmetryAxis(part('p', type, [4, 5, 6], r));
    near(axis.origin.toArray(), [4, 5, 6]);
    near(axis.direction.toArray(), new T.Vector3(0, 1, 0).applyQuaternion(quat(r)).toArray());
  }
  for (const type of ['wing', 'fin'])
    near(
      parentSymmetryAxis(part('p', type, [4, 5, 6], r)).direction.toArray(),
      new T.Vector3(-1, 0, 0).applyQuaternion(quat(r)).toArray()
    );
  for (const type of Object.keys(PARTS)) {
    const axis = parentSymmetryAxis(part('p', type, [0, 0, 0]));
    assert.ok(Math.abs(axis.direction.length() - 1) < 1e-12, type);
  }
});

test('Parent-mode radial copies turn about an off-axis, rotated parent for every count in VAB and SPH', () => {
  for (const bay of ['vab', 'sph'])
    for (const count of [2, 3, 4, 6, 8]) {
      const parent = part('side', 'tank', [3, 1.5, -2], [0.4, 0.3, -0.6], 'core'),
        parts = [part('core', 'tank', [0, 0, 0]), parent],
        first = source([3.6, 1.1, -1.7], [0.2, 0.9, 0.1], 'side'),
        before = [first.pos.toArray(), first.q.toArray()],
        copies = symmetryCopies(parts, first, String(count), bay, 'engine', 'parent'),
        axis = parentSymmetryAxis(parent);
      assert.equal(copies.length, count);
      assert.deepEqual([first.pos.toArray(), first.q.toArray()], before);
      near(copies[0].pos.toArray(), first.pos.toArray());
      near(copies[0].frame, new T.Matrix4().toArray());
      const start = polar(axis, first.pos, first.pos);
      for (const [i, c] of copies.entries()) {
        assert.equal(c.parent, 'side');
        const at = polar(axis, c.pos, first.pos),
          label = `${bay} ×${count} #${i}`;
        assert.ok(Math.abs(at.radius - start.radius) < 1e-9, label);
        assert.ok(Math.abs(at.along - start.along) < 1e-9, label);
        const turn = (i * 360) / count;
        assert.ok(Math.abs(((at.angle - turn + 540) % 360) - 180) < 1e-7, `${label} angle ${at.angle}`);
        // The saved frame carries the first pose onto this copy and keeps the parent in place.
        const frame = new T.Matrix4().fromArray(c.frame);
        near(first.pos.clone().applyMatrix4(frame).toArray(), c.pos.toArray(), 1e-9, label);
        assert.ok(
          c.q.angleTo(new T.Quaternion().setFromRotationMatrix(frame).multiply(first.q)) < 1e-7,
          label
        );
        near(frame.clone().multiply(matrix(parent)).elements.slice(12, 15), parent.p, 1e-9, label);
        assert.ok(
          Math.abs(axis.direction.clone().transformDirection(frame).dot(axis.direction) - 1) < 1e-12,
          label
        );
      }
      // The bay only matters for the vessel axis: the same parent gives the same copies in both bays.
      const other = symmetryCopies(
        parts,
        first,
        String(count),
        bay === 'vab' ? 'sph' : 'vab',
        'engine',
        'parent'
      );
      for (const [i, c] of copies.entries()) near(c.pos.toArray(), other[i].pos.toArray());
    }
});

test('Parent-mode mirror puts the pair left and right of the parent and keeps the part right-handed', () => {
  for (const bay of ['vab', 'sph']) {
    const upright = bay === 'vab' ? [0, 0, 0] : [Math.PI / 2, 0, 0],
      parent = part('side', 'tank', [3, 1, 2], upright, 'core'),
      parts = [part('core', 'tank', [0, 0, 0], upright), parent];
    for (const type of ['engine', 'wing']) {
      const first = source([3.4, 1.2, 2.3], [0.2, 0.4, 0.6], 'side'),
        [a, b] = symmetryCopies(parts, first, 'mirror', bay, type, 'parent');
      near(a.pos.toArray(), [3.4, 1.2, 2.3]);
      near(b.pos.toArray(), [2.6, 1.2, 2.3]);
      assert.equal(b.parent, 'side');
      const reflect = new T.Matrix4().makeScale(-1, 1, 1),
        expected = new T.Matrix4().makeRotationFromQuaternion(first.q).premultiply(reflect).multiply(reflect);
      if (type === 'wing') expected.multiply(new T.Matrix4().makeRotationY(Math.PI));
      assert.ok(b.q.angleTo(new T.Quaternion().setFromRotationMatrix(expected)) < 1e-7);
      const frame = new T.Matrix4().fromArray(b.frame);
      assert.ok(Math.abs(frame.determinant() + 1) < 1e-12);
      near(first.pos.clone().applyMatrix4(frame).toArray(), b.pos.toArray());
      near(new T.Vector3(...parent.p).applyMatrix4(frame).toArray(), parent.p);
    }
  }
  // A tilted parent: the plane still contains its axis and the normal stays as close to left/right as it can.
  const tilted = part('side', 'tank', [3, 1, 2], [0.2, 0.1, 0.5]),
    axis = parentSymmetryAxis(tilted),
    normal = parentMirrorNormal(axis.direction, 'vab');
  assert.ok(Math.abs(normal.dot(axis.direction)) < 1e-12);
  assert.ok(normal.x > 0.8);
  const [, copy] = symmetryCopies(
    [tilted],
    source([3.5, 1.4, 2.2], [0, 0, 0], 'side'),
    'mirror',
    'vab',
    'engine',
    'parent'
  );
  const mid = copy.pos
    .clone()
    .add(new T.Vector3(3.5, 1.4, 2.2))
    .multiplyScalar(0.5)
    .sub(axis.origin);
  assert.ok(Math.abs(mid.dot(normal)) < 1e-9);
  // An axis pointing left/right: mirror across the plane through it and the bay's own axis.
  near(parentMirrorNormal(new T.Vector3(1, 0, 0), 'vab').toArray(), [0, 0, -1]);
  near(parentMirrorNormal(new T.Vector3(-1, 0, 0), 'sph').toArray(), [0, -1, 0]);
  const wing = part('w', 'wing', [2, 0, 0], [0, 0, 0]),
    [, under] = symmetryCopies(
      [wing],
      source([2.2, 0.1, 0.4], [0, 0, 0], 'w'),
      'mirror',
      'vab',
      'engine',
      'parent'
    );
  near(under.pos.toArray(), [2.2, 0.1, -0.4]);
});

test('Vessel mode creates exactly the parts it created before the axis choice existed', () => {
  const truss = part('hub', 'truss', [0, 0, 0]),
    cases = [];
  for (const bay of ['vab', 'sph'])
    for (const sym of ['1', '2', '3', '4', '6', '8', 'mirror'])
      for (const type of ['engine', 'wing', 'fin', 'tank', 'wheel', 'rcs'])
        for (const [pos, r] of [
          [
            [1.3, 0.4, -0.7],
            [0.2, 0.4, 0.6]
          ],
          [
            [0, 2, 0],
            [0, 0, 0]
          ],
          [
            [-2.5, -1, 3],
            [Math.PI / 2, 0, 1]
          ]
        ])
          for (const attachment of [{mode: 'surface'}, {mode: 'free'}])
            for (const parent of ['hub', null])
              cases.push({
                bay,
                sym,
                type,
                pending: source(pos, r, parent, attachment),
                parts: parent ? [truss] : []
              });
  // Node mounts: a frame's four side nodes in the VAB (×2, ×4, mirror) and the nodes on the SPH axis.
  for (const sym of ['1', '2', '4', 'mirror'])
    cases.push({
      bay: 'vab',
      sym,
      type: 'truss',
      parts: [truss],
      pending: source([1, 0, 0], [0, 0, 0], 'hub', {mode: 'node', parentNode: 2, ownNode: 3})
    });
  for (const sym of ['2', '4', 'mirror'])
    cases.push({
      bay: 'sph',
      sym,
      type: 'truss',
      parts: [truss],
      pending: source([1, 0, 0], [0, 0, 0], 'hub', {mode: 'node', parentNode: 2, ownNode: 3})
    });
  // A node placement the old code refused (no node where the third copy lands) must still be refused.
  cases.push({
    bay: 'vab',
    sym: '3',
    type: 'truss',
    parts: [truss],
    pending: source([1, 0, 0], [0, 0, 0], 'hub', {mode: 'node', parentNode: 2, ownNode: 3})
  });
  let placed = 0,
    refused = 0;
  for (const c of cases) {
    let expected, error;
    try {
      expected = referencePlacement(c.parts, c.type, c.pending, c.sym, c.bay, ids());
    } catch (e) {
      error = e.message;
    }
    for (const axis of [undefined, 'vessel']) {
      if (error) {
        assert.throws(() => symmetricParts(c.parts, c.type, c.pending, c.sym, c.bay, axis, ids()), {
          message: error
        });
        refused++;
        continue;
      }
      const actual = symmetricParts(c.parts, c.type, c.pending, c.sym, c.bay, axis, ids());
      assert.deepEqual(actual, expected);
      assert.equal(JSON.stringify(actual), JSON.stringify(expected));
      placed++;
    }
    // Parent mode has nothing to turn about without a parent or with symmetry off: same parts again.
    if (!error && (c.sym === '1' || c.pending.parent === null))
      assert.equal(
        JSON.stringify(symmetricParts(c.parts, c.type, c.pending, c.sym, c.bay, 'parent', ids())),
        JSON.stringify(expected)
      );
  }
  assert.ok(placed > 2000 && refused === 2, `${placed} placed, ${refused} refused`);
  const full = Array.from({length: 398}, (_, i) =>
    part('p' + i, 'truss', [i, 0, 0], [0, 0, 0], i ? 'p0' : null)
  );
  for (const axis of ['vessel', 'parent']) {
    assert.throws(() => symmetricParts(full, 'rcs', source([1, 1, 0], [0, 0, 0], 'p0'), '3', 'vab', axis), {
      message: '部品上限は400です'
    });
    assert.equal(symmetricParts(full, 'rcs', source([1, 1, 0], [0, 0, 0], 'p0'), '2', 'vab', axis).length, 2);
  }
});

test('Parent mode on a parent with symmetric counterparts places the set on each, in one linked group', () => {
  for (const bay of ['vab', 'sph'])
    for (const [parentMode, m] of [
      ['4', 4],
      ['3', 3],
      ['mirror', 2]
    ])
      for (const [mode, n] of [
        ['3', 3],
        ['4', 4],
        ['mirror', 2]
      ]) {
        const craft = boosters(parentMode, bay),
          b0 = craft.find(p => p.id === 'b0'),
          at = new T.Vector3(0.1, -0.5, 0.33).applyMatrix4(matrix(b0)),
          created = symmetricParts(
            craft,
            'engine',
            source(at.toArray(), b0.r, 'b0'),
            mode,
            bay,
            'parent',
            ids('e')
          ),
          all = validateCraft({version: 1, parts: [...craft, ...created]}),
          label = `${bay} ${parentMode} × ${mode}`;
        assert.equal(created.length, n * m, label);
        assert.equal(new Set(created.map(p => p.symmetryGroup)).size, 1, label);
        assert.ok(hasSymmetryGeometry(all, 'e0'), label);
        assert.equal(symmetryTargets(all, 'e0').length, n * m, label);
        // N on each counterpart, the clicked parent first.
        assert.deepEqual(
          created.slice(0, n).map(p => p.parent),
          Array(n).fill('b0'),
          label
        );
        for (const b of craft.filter(p => p.id !== 'core'))
          assert.equal(created.filter(p => p.parent === b.id).length, n, label);
        // Every copy sits at the same distance from its own parent's axis and the same height along it.
        const height = new Set(),
          radius = new Set();
        for (const p of created) {
          const parent = all.find(q => q.id === p.parent),
            axis = parentSymmetryAxis(parent),
            polarAt = polar(axis, new T.Vector3(...p.p), new T.Vector3(...p.p));
          height.add(polarAt.along.toFixed(7));
          radius.add(polarAt.radius.toFixed(7));
        }
        assert.equal(height.size, 1, label);
        assert.equal(radius.size, 1, label);
        // Rotational counterparts carry an identical arrangement in their own frame.
        if (parentMode !== 'mirror') {
          const arrangement = id =>
            created
              .filter(p => p.parent === id)
              .map(p =>
                relative(
                  all.find(q => q.id === id),
                  p
                )
                  .map(v => (+v.toFixed(6) || 0).toFixed(6))
                  .join()
              )
              .sort();
          for (const b of craft.filter(p => p.id !== 'core'))
            assert.deepEqual(arrangement(b.id), arrangement('b0'), label);
        } else {
          // A mirrored counterpart carries the mirror image.
          const mirrored = created.filter(p => p.parent === 'b1').map(p => p.p),
            own = created.filter(p => p.parent === 'b0').map(p => [-p.p[0], p.p[1], p.p[2]]);
          for (const p of own)
            assert.ok(
              mirrored.some(q => Math.hypot(...q.map((v, i) => v - p[i])) < 1e-9),
              label
            );
        }
      }
});

test('Counterparts moved individually, or from a group without saved frames, are left out', () => {
  const craft = boosters('4');
  assert.deepEqual(
    symmetryCounterparts(craft, 'b2').map(c => c.id),
    ['b2', 'b0', 'b1', 'b3']
  );
  assert.deepEqual(
    symmetryCounterparts(craft, 'core').map(c => c.id),
    ['core']
  );
  const moved = editSymmetryPose(craft, 'b1', {position: [0.2, 3, 2.4], rotation: [0, 0, 0]}, false);
  assert.deepEqual(
    symmetryCounterparts(moved, 'b0').map(c => c.id),
    ['b0', 'b2', 'b3']
  );
  const b0 = moved.find(p => p.id === 'b0'),
    created = symmetricParts(
      moved,
      'engine',
      source([b0.p[0] + 0.4, b0.p[1], b0.p[2]], [0, 0, 0], 'b0'),
      '3',
      'vab',
      'parent'
    );
  assert.equal(created.length, 9);
  assert.ok(!created.some(p => p.parent === 'b1'));
  const legacy = structuredClone(craft);
  for (const p of legacy) delete p.symmetryFrame;
  assert.deepEqual(
    symmetryCounterparts(legacy, 'b0').map(c => c.id),
    ['b0']
  );
  assert.equal(
    symmetricParts(legacy, 'engine', source([2.4, 0.3, 0.5], [0, 0, 0], 'b0'), '3', 'vab', 'parent').length,
    3
  );
  assert.throws(() => symmetryCounterparts(craft, 'missing'));
});

test('Linked edits move every copy about its own parent axis, and the copies travel with their parents', () => {
  for (const bay of ['vab', 'sph'])
    for (const [parentMode, mode] of [
      ['4', '3'],
      ['mirror', '3'],
      ['4', 'mirror'],
      ['mirror', 'mirror']
    ]) {
      const craft = boosters(parentMode, bay),
        b0 = craft.find(p => p.id === 'b0'),
        at = new T.Vector3(0.1, -0.5, 0.33).applyMatrix4(matrix(b0)),
        created = symmetricParts(
          craft,
          'engine',
          source(at.toArray(), b0.r, 'b0'),
          mode,
          bay,
          'parent',
          ids('e')
        ),
        all = [...craft, ...created],
        label = `${bay} ${parentMode} × ${mode}`;
      const check = (parts, tag) => {
        // The arrangement stays what a fresh placement of the first copy would produce.
        const first = parts.find(p => p.id === 'e0'),
          again = symmetryCopies(
            parts.filter(p => !p.id.startsWith('e')),
            {pos: new T.Vector3(...first.p), q: quat(first.r), parent: 'b0'},
            mode,
            bay,
            'engine',
            'parent'
          );
        assert.equal(again.length, created.length, label + tag);
        for (const [i, c] of again.entries()) {
          const p = parts.find(q => q.id === 'e' + i);
          assert.equal(p.parent, c.parent, label + tag);
          near(p.p, c.pos.toArray(), 1e-6, `${label}${tag} e${i}`);
          assert.ok(quat(p.r).angleTo(c.q) < 1e-6, `${label}${tag} e${i} rotation`);
        }
      };
      check(all, ' placed');
      const delta = new T.Matrix4().compose(
          new T.Vector3(0.07, -0.2, 0.11),
          quat([0.3, -0.2, 0.5]),
          new T.Vector3(1, 1, 1)
        ),
        target = delta.multiply(matrix(all.find(p => p.id === 'e0'))),
        pos = new T.Vector3(),
        q = new T.Quaternion();
      target.decompose(pos, q, new T.Vector3());
      const e = new T.Euler().setFromQuaternion(q),
        edited = editSymmetryPose(all, 'e0', {position: pos.toArray(), rotation: [e.x, e.y, e.z]});
      check(edited, ' edited');
      // Unlinked: only the edited copy moves.
      const alone = editSymmetryPose(all, 'e1', {position: [9, 9, 9], rotation: [0, 0, 0]}, false);
      for (const p of alone) if (p.id !== 'e1') assert.deepEqual(p.p, all.find(q => q.id === p.id).p);
      // Moving the parents (linked) carries each set; a later linked edit of a copy still fits.
      const pb = edited.find(p => p.id === 'b0'),
        carried = editSymmetryPose(edited, 'b0', {
          position: [pb.p[0] * 1.5, pb.p[1] + 0.4, pb.p[2] * 1.5],
          rotation: pb.r
        });
      check(carried, ' carried');
      const pe = carried.find(p => p.id === 'e0');
      check(
        editSymmetryPose(carried, 'e0', {position: [pe.p[0], pe.p[1] - 0.3, pe.p[2]], rotation: pe.r}),
        ' edited after carrying'
      );
      // Linked settings and stages reach every copy.
      const staged = editSymmetrySetting(carried, 'e2', 'stage', 3);
      assert.ok(
        staged.filter(p => p.id.startsWith('e')).every(p => p.stage === 3),
        label
      );
      assert.ok(
        staged.filter(p => !p.id.startsWith('e')).every(p => p.stage === 0),
        label
      );
    }
});

test('Parent-mode node mounts bind one free node of the parent per copy, or place nothing', () => {
  const core = part('core', 'tank', [0, 0, 0]),
    hub = part('hub', 'truss', [3, 0.5, 0], [0, 0.4, 0], 'core'),
    parts = [core, hub],
    side = nodePose(hub, 2),
    own = nodePose(part('x', 'truss', [0, 0, 0], hub.r), 3),
    first = source(side.position.clone().sub(own.position).toArray(), hub.r, 'hub', {
      mode: 'node',
      parentNode: 2,
      ownNode: 3
    });
  for (const [mode, count] of [
    ['2', 2],
    ['4', 4]
  ]) {
    const created = symmetricParts(parts, 'truss', first, mode, 'vab', 'parent', ids('t'));
    assert.equal(created.length, count);
    assert.ok(created.every(p => p.parent === 'hub' && p.attachment.mode === 'node'));
    assert.equal(new Set(created.map(p => p.attachment.parentNode)).size, count, mode);
    validateCraft({version: 1, parts: [...parts, ...created]});
  }
  // Mirror: an unrotated hub has a node on its other side; the rotated hub has none there.
  const square = part('hub', 'truss', [3, 0.5, 0], [0, 0, 0], 'core'),
    pair = symmetricParts(
      [core, square],
      'truss',
      source([4, 0.5, 0], [0, 0, 0], 'hub', {mode: 'node', parentNode: 2, ownNode: 3}),
      'mirror',
      'vab',
      'parent',
      ids('m')
    );
  assert.deepEqual(
    pair.map(p => p.attachment.parentNode),
    [2, 3]
  );
  near(pair[1].p, [2, 0.5, 0]);
  validateCraft({version: 1, parts: [core, square, ...pair]});
  assert.throws(() => symmetricParts(parts, 'truss', first, 'mirror', 'vab', 'parent', ids('t')));
  assert.throws(() => symmetricParts(parts, 'truss', first, '3', 'vab', 'parent', ids('t')), {
    message: '対称の取付先を一意に決められません。各部品の位置に合う接続点が必要です'
  });
  // A node already in use on the parent refuses the whole placement.
  const taken = [...parts, ...symmetricParts(parts, 'truss', first, '1', 'vab', 'parent', ids('u'))];
  const opposite = symmetryCopies(parts, first, '2', 'vab', 'truss', 'parent')[1];
  assert.throws(
    () =>
      symmetricParts(
        taken,
        'truss',
        {...first, pos: opposite.pos, q: opposite.q, attachment: {mode: 'node', parentNode: 3, ownNode: 3}},
        '2',
        'vab',
        'parent',
        ids('v')
      ),
    {message: 'この接続点は使用済みです。別の接続点を選んでください'}
  );
  // The copies never bind to another part that happens to have a node there.
  const twin = part('twin', 'truss', [3, 0.5, -2], [0, 0.4, 0], 'core'),
    between = source(
      nodePose(hub, 5)
        .position.clone()
        .sub(nodePose(part('x', 'truss', [0, 0, 0], hub.r), 4).position)
        .toArray(),
      hub.r,
      'hub',
      {
        mode: 'node',
        parentNode: 5,
        ownNode: 4
      }
    ),
    bound = symmetricParts([core, hub, twin], 'truss', between, '2', 'vab', 'parent', ids('w'));
  assert.deepEqual(
    bound.map(p => p.parent),
    ['hub', 'hub']
  );
});

test('Parent-mode groups survive save and load, branch copy and move, and deletion', () => {
  const craft = boosters('4'),
    b0 = craft.find(p => p.id === 'b0'),
    created = symmetricParts(
      craft,
      'engine',
      source([b0.p[0] + 0.33, b0.p[1] - 0.5, b0.p[2] + 0.1], [0, 0, 0], 'b0'),
      '3',
      'vab',
      'parent',
      ids('e')
    ),
    all = validateCraft({version: 1, parts: [...craft, ...created]});
  assert.equal(all.length, 17);
  const loaded = loadCraft(JSON.parse(JSON.stringify(saveCraft(all, 'saved'))));
  assert.equal(JSON.stringify(loaded), JSON.stringify(all));
  assert.ok(hasSymmetryGeometry(loaded, 'e0'));
  // Duplicating one side tank with its three engines: the copy's engines form their own group of three.
  const copy = placeBranch(all, extractBranch(all, 'b0'), {
      position: [0, 5, 0],
      rotation: [0.3, 0, 0],
      parent: 'core'
    }),
    copied = copy.parts.filter(p => descendants(copy.parts, copy.rootId).has(p.id) && p.type === 'engine');
  assert.equal(copy.count, 4);
  assert.equal(copied.length, 3);
  assert.equal(new Set(copied.map(p => p.symmetryGroup)).size, 1);
  assert.notEqual(copied[0].symmetryGroup, created[0].symmetryGroup);
  const root = copy.parts.find(p => p.id === copy.rootId),
    turned = editSymmetryPose(copy.parts, copied[0].id, {
      position: new T.Vector3(0.4, -0.2, 0).applyMatrix4(matrix(root)).toArray(),
      rotation: copied[0].r
    }),
    axis = parentSymmetryAxis(root),
    places = copied.map(p =>
      polar(
        axis,
        new T.Vector3(...turned.find(q => q.id === p.id).p),
        new T.Vector3(...turned.find(q => q.id === copied[0].id).p)
      )
    );
  near(
    places.map(p => p.radius),
    [0.4, 0.4, 0.4],
    1e-7
  );
  near(
    places.map(p => p.angle).sort((a, b) => a - b),
    [0, 120, 240],
    1e-5
  );
  // Moving one side tank elsewhere: its engines leave the group, the other nine stay linked.
  const moved = moveBranch(all, 'b1', {position: [0, 6, 0], rotation: [0, 0, 0.5], parent: 'core'}).parts,
    groups = new Map();
  for (const p of moved.filter(p => p.type === 'engine'))
    groups.set(p.symmetryGroup, (groups.get(p.symmetryGroup) ?? 0) + 1);
  assert.deepEqual([...groups.values()].sort(), [3, 9]);
  // Deleting copies: the rest stay a group; a lone survivor loses it.
  const fewer = normalizeSymmetry(structuredClone(all).filter(p => p.parent !== 'b2' || p.type !== 'engine'));
  assert.equal(symmetryTargets(validateCraft({version: 1, parts: fewer}), 'e0').length, 9);
  const lone = normalizeSymmetry(structuredClone(all).filter(p => p.type !== 'engine' || p.id === 'e4'));
  assert.equal(lone.find(p => p.id === 'e4').symmetryGroup, undefined);
  assert.equal(lone.find(p => p.id === 'e4').symmetryFrame, undefined);
  validateCraft({version: 1, parts: lone});
});

test('Saved frames of parent-mode groups validate, and malformed frames are rejected', () => {
  for (const bay of ['vab', 'sph'])
    for (const mode of ['2', '3', '4', '6', '8', 'mirror']) {
      const parent = part('side', 'tank', [3, 1.5, -2], [0.4, 0.3, -0.6], 'core'),
        parts = [part('core', 'tank', [0, 0, 0]), parent],
        created = symmetricParts(
          parts,
          'rcs',
          source([3.6, 1.1, -1.7], [0.2, 0.9, 0.1], 'side'),
          mode,
          bay,
          'parent',
          ids()
        );
      validateCraft({version: 1, parts: [...parts, ...created]});
      const broken = (change, message) => {
        const copy = structuredClone([...parts, ...created]);
        change(copy.at(-1));
        assert.throws(() => validateCraft({version: 1, parts: copy}), {message}, `${bay} ${mode}`);
      };
      broken(p => p.symmetryFrame.pop(), '対称軸が不正です');
      broken(p => (p.symmetryFrame[12] = NaN), '対称軸が不正です');
      broken(p => (p.symmetryFrame[13] = 2e7), '対称軸が不正です');
      broken(p => (p.symmetryFrame[3] = 0.1), '対称軸が不正です');
      broken(p => (p.symmetryFrame[15] = 2), '対称軸が不正です');
      broken(p => (p.symmetryFrame = 'x'), '対称軸が不正です');
      broken(p => (p.symmetryFrame[0] += 0.5), '対称軸の倍率・角度が不正です');
      broken(p => {
        for (const i of [0, 1, 2]) p.symmetryFrame[i] *= 2;
      }, '対称軸の倍率・角度が不正です');
      broken(p => delete p.symmetryGroup, '対称軸にグループがありません');
      broken(p => (p.type = 'engine'), '対称グループの部品種類が異なります');
    }
});

test('Every example craft still validates and round-trips through save and load', () => {
  for (const kind of Object.keys(examples)) {
    const parts = preset(kind);
    assert.ok(parts.length > 0, kind);
    const checked = validateCraft({version: 1, parts});
    assert.equal(
      JSON.stringify(loadCraft(JSON.parse(JSON.stringify(saveCraft(checked, kind))))),
      JSON.stringify(checked),
      kind
    );
    assert.equal(JSON.stringify(checked), JSON.stringify(parts), kind);
  }
});
