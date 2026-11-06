import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {preset} from '../dist/catalog.js';
import {validateCraft, statistics} from '../dist/core.js';
import {loadCraft, saveCraft} from '../dist/craft-save.js';
import {nodePose} from '../dist/attachment-nodes.js';
import {appendDesign, designForLaunch} from '../dist/design-library.js';
const posesEqual = (actual, expected) =>
  actual.forEach((p, i) => {
    assert.ok(new T.Vector3(...p.p).distanceTo(new T.Vector3(...expected[i].p)) < 1e-10);
    assert.deepEqual({...p, p: []}, {...expected[i], p: []});
  });
test('legacy and new workshop files keep parts, centre of mass and attachment positions', () => {
  for (const type of ['rocket', 'plane', 'plane-large', 'transport', 'rover']) {
    const parts = preset(type),
      before = structuredClone(parts);
    posesEqual(loadCraft({version: 1, parts}), before);
    let restored = parts;
    for (let i = 0; i < 5; i++) {
      const record = saveCraft(restored, 'name');
      assert.equal(record.version, 2);
      assert.equal(record.partFrame, 'nominal-center-v1');
      assert.throws(() => validateCraft(record), 'old readers must reject new coordinates');
      restored = loadCraft(JSON.parse(JSON.stringify(record)));
      posesEqual(restored, before);
    }
    assert.ok(statistics(restored).com.distanceTo(statistics(before).com) < 1e-10);
    restored.forEach((p, i) =>
      assert.ok(nodePose(p, 0).position.distanceTo(nodePose(before[i], 0).position) < 1e-10)
    );
    assert.deepEqual(parts, before);
  }
});
test('new standalone save can migrate into the existing design library without double conversion', () => {
  const original = preset('transport');
  const file = saveCraft(original, 'transport');
  const library = appendDesign(
    {version: 1, designs: []},
    {name: file.name, parts: loadCraft(file), bay: 'sph', environment: 'runway'},
    'test',
    0
  );
  posesEqual(designForLaunch(library, 'test', 'runway').parts, original);
});
test('invalid formats and malformed encoded poses reject without mutating input', () => {
  const good = saveCraft(preset('plane'), 'name');
  for (const mutate of [
    s => delete s.partFrame,
    s => (s.partFrame = 'future'),
    s => (s.version = 99),
    s => (s.version = 1),
    s => (s.parts = null),
    s => (s.parts[0].r = [NaN, 0, 0]),
    s => (s.parts[0].p = [0]),
    s => (s.parts[0].parent = 'missing')
  ]) {
    const bad = structuredClone(good);
    mutate(bad);
    const before = structuredClone(bad);
    assert.throws(() => loadCraft(bad));
    assert.deepEqual(bad, before);
  }
  assert.throws(() => loadCraft(null));
  // Preserve the existing export-empty/read-reject policy.
  assert.deepEqual(saveCraft([], 'empty').parts, []);
  assert.throws(() => loadCraft(saveCraft([], 'empty')));
});
