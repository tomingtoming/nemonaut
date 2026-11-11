import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {replay} from '../tools/golden/replay-js.mjs';
import {compareGolden, assertGolden} from '../tools/golden/compare.mjs';
import {retired, retiredFields} from '../tools/golden/retired.mjs';
/** The comparison options of one case: its mode, the baseline's tolerances and its retired fields. */
function options(baseline, definition) {
  const fields = retiredFields(
    baseline.version,
    baseline.cases.map(c => c.definition.name)
  );
  return {mode: definition.mode, limits: baseline.tolerances, retired: fields.get(definition.name) ?? []};
}
const baseline = JSON.parse(
  readFileSync(new URL('./golden/js-v1.json', import.meta.url), 'utf8').replace(/^\uFEFF/, '')
);
for (const {definition, expected} of baseline.cases)
  test('golden v1 (recorded on the JS solver, replayed on Rust): ' + definition.name, () =>
    assertGolden(expected, replay(definition), options(baseline, definition))
  );
test('golden rejects control/topology/fuel regressions but tolerates numeric noise and quaternion sign', () => {
  const original = baseline.cases[0].expected,
    copy = () => structuredClone(original);
  let changed = copy();
  changed.samples[0].vessels[0].position[0] += 0.001;
  changed.samples[0].vessels[0].quaternion = changed.samples[0].vessels[0].quaternion.map(n => -n);
  assert.equal(compareGolden(original, changed).pass, true);
  for (const mutate of [
    v => (v.state.controllable = !v.state.controllable),
    v => v.parts.pop(),
    v => (v.resources[0].fuel += 1),
    v => (v.position[0] += 1),
    v => (v.velocity[0] = NaN)
  ]) {
    changed = copy();
    mutate(changed.samples[0].vessels[0]);
    assert.equal(compareGolden(original, changed).pass, false);
  }
});
test('impact golden permits divergent fragment trajectories but still rejects wrong failure causes', () => {
  const original = baseline.cases.find(c => c.definition.name === 'fuel-tank-impact').expected,
    changed = structuredClone(original);
  changed.samples.at(-1).vessels[0].position[0] += 10;
  assert.equal(compareGolden(original, changed, {mode: 'impact'}).pass, true);
  assert.equal(compareGolden(original, changed).pass, false);
  changed.samples.at(-1).events[0].cause = 'thermal';
  assert.equal(compareGolden(original, changed, {mode: 'impact'}).pass, false);
});

test('impact comparison still rejects nonfinite diagnostic trajectories', () => {
  const original = baseline.cases.find(c => c.definition.mode === 'impact').expected,
    changed = structuredClone(original);
  changed.samples.at(-1).vessels[0].position[0] = NaN;
  assert.equal(compareGolden(original, changed, {mode: 'impact'}).pass, false);
});

// Golden v2: the failed part is decided by contact impulse ranking.
const v2 = JSON.parse(
  readFileSync(new URL('./golden/js-v2.json', import.meta.url), 'utf8').replace(/^\uFEFF/, '')
);
for (const {definition, expected} of v2.cases)
  test('golden v2 (recorded on the JS solver, replayed on Rust): ' + definition.name, () =>
    assertGolden(expected, replay(definition), options(v2, definition))
  );
test('golden v2 rejects contact impulses that are read as zero', async () => {
  const R = (await import('../dist/physics.js')).default,
    original = R.World.prototype.contactPair;
  R.World.prototype.contactPair = function (a, b, callback) {
    original.call(this, a, b, m =>
      callback({numContacts: () => m.numContacts(), contactImpulse: () => 0}, false)
    );
  };
  try {
    for (const {definition, expected} of v2.cases)
      assert.equal(
        compareGolden(expected, replay(definition), options(v2, definition)).pass,
        false,
        definition.name
      );
  } finally {
    R.World.prototype.contactPair = original;
  }
});
test('a retired golden field is the only value not compared, and must still be a finite number', () => {
  assert.deepEqual(
    retired.map(({version, case: name, path}) => [version, name, path]),
    [[2, 'capsule-tank-impulse-ranking', 'result.samples[3].vessels[0].resources[0].charge']]
  );
  for (const entry of retired) assert.ok(entry.reason.length > 20, 'a retired field states its reason');
  const {definition, expected} = v2.cases.find(c => c.definition.name === 'capsule-tank-impulse-ranking'),
    actual = replay(definition),
    opts = options(v2, definition),
    field = r => r.samples[3].vessels[0].resources[0],
    changed = mutate => {
      const copy = structuredClone(actual);
      mutate(copy);
      return compareGolden(expected, copy, opts);
    };
  assert.equal(opts.retired.length, 1);
  assert.equal(compareGolden(expected, actual, opts).pass, true);
  // Without the entry the recorded value is compared and differs by more than the tolerance.
  const strict = compareGolden(expected, actual, {...opts, retired: []});
  assert.deepEqual(
    strict.failures.map(f => f.path),
    opts.retired
  );
  // Any value passes there, but it has to be a finite number.
  assert.equal(changed(r => (field(r).charge += 5)).pass, true);
  assert.equal(changed(r => (field(r).charge = NaN)).pass, false);
  assert.equal(changed(r => (field(r).charge = Infinity)).pass, false);
  assert.equal(changed(r => (field(r).charge = '990')).pass, false);
  assert.equal(changed(r => delete field(r).charge).pass, false);
  // Every other field of the case is still compared: the same vessel, the same sample, the same key.
  assert.equal(changed(r => (field(r).fuel += 1)).pass, false);
  assert.equal(changed(r => (field(r).temperature += 1)).pass, false);
  assert.equal(changed(r => (r.samples[2].vessels[0].resources[0].charge += 0.01)).pass, false);
  assert.equal(changed(r => (r.samples[3].vessels[1].resources[0].charge += 0.01)).pass, false);
  assert.equal(
    changed(r => (r.samples[3].vessels[0].state.crashed = !r.samples[3].vessels[0].state.crashed)).pass,
    false
  );
});
test('a retired golden field that matches nothing fails', () => {
  const {definition, expected} = v2.cases[0],
    actual = replay(definition),
    opts = options(v2, definition);
  for (const path of [
    'result.samples[9].vessels[0].resources[0].charge',
    'result.samples[3].vessels[0].resources[0].power',
    'samples[3].vessels[0].resources[0].charge'
  ]) {
    const result = compareGolden(expected, actual, {...opts, retired: [...opts.retired, path]});
    assert.equal(result.pass, false, path);
    assert.deepEqual(
      result.failures.map(f => [f.path, f.reason]),
      [[path, 'retired field matches nothing in the baseline']]
    );
  }
  // A retired path has to name a recorded number, not a branch of the result.
  assert.equal(
    compareGolden(expected, actual, {...opts, retired: ['result.samples[3].vessels[0].resources']}).pass,
    false
  );
  const names = v2.cases.map(c => c.definition.name),
    entry = {version: 2, case: 'no-such-case', path: 'result.samples[0]', reason: ''};
  assert.throws(() => retiredFields(2, names, [entry]), /missing case: v2 no-such-case/);
  assert.equal(retiredFields(1, names, [entry]).size, 0, 'entries of another version are not this one');
  // The list as committed resolves against each baseline it names.
  for (const b of [baseline, v2])
    retiredFields(
      b.version,
      b.cases.map(c => c.definition.name)
    );
  for (const entry of retired)
    assert.ok([1, 2].includes(entry.version), 'only frozen baselines retire fields');
});

// Golden v3: recorded on Rust physics. Vessel-vessel collision, and the v2 capsule case again.
const v3 = JSON.parse(
  readFileSync(new URL('./golden/js-v3.json', import.meta.url), 'utf8').replace(/^\uFEFF/, '')
);
for (const {definition, expected} of v3.cases)
  test('Rust golden v3: ' + definition.name, () =>
    assertGolden(expected, replay(definition), options(v3, definition))
  );
test('golden v3 rejects replay without vessel-vessel collision', () => {
  const colliding = v3.cases.filter(c => c.definition.vesselCollision === true);
  assert.deepEqual(
    colliding.map(c => c.definition.name),
    ['orbit-bump-2ms', 'orbit-crash-30ms', 'fuel-tank-impact-fragments-collide']
  );
  for (const {definition, expected} of colliding)
    assert.equal(
      compareGolden(expected, replay({...definition, vesselCollision: false}), {
        mode: definition.mode,
        limits: v3.tolerances
      }).pass,
      false,
      definition.name
    );
});
