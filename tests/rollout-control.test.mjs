import test from 'node:test';
import assert from 'node:assert/strict';
import {RolloutControl} from '../tools/rollout-control.mjs';
import {rolloutImpact} from '../tools/rollout-impact-profile.mjs';
import {RUNWAY} from '../dist/runway-navigation.js';
test('limited runway or high speed demands immediate braking and latches it', () => {
  for (const [speed, remaining] of [
    [90, 700],
    [150, 1700],
    [40, 100]
  ]) {
    const c = new RolloutControl();
    assert.equal(c.step({speed, pitchRate: -10, remaining}, 1 / 120).brake, true);
    assert.equal(c.step({speed: 0, pitchRate: 0, remaining: 5000}, 1 / 120).brake, true);
  }
});
test('runway reserve permits bounded delay; pause does not consume it', () => {
  const c = new RolloutControl(),
    state = {speed: 70, pitchRate: -10, remaining: 1400};
  assert.equal(c.step(state, 0).brake, false);
  assert.equal(c.elapsed, 0);
  for (let i = 0; i < 10; i++) assert.equal(c.step(state, 0.1).brake, false);
  // Floating-point accumulation can leave a tiny positive delay at 1 second.
  c.step(state, 0.01);
  assert.equal(c.step(state, 0.01).brake, true);
  assert.equal(c.step(state, 0).pitch, -0.5);
});
test('non-finite observations fail to braking instead of producing NaN commands', () => {
  for (const key of ['speed', 'pitchRate', 'remaining']) {
    const state = {speed: 70, pitchRate: 0, remaining: 1400, [key]: NaN};
    assert.deepEqual(new RolloutControl().step(state, 0.01), {brake: true, pitch: 0, invalid: true});
  }
});
for (const kind of ['plane', 'plane-large', 'transport-cargo'])
  test(`${kind} runway guard retains gentle touchdown and runway stop`, () => {
    const r = rolloutImpact({kind, mode: 'guarded', offset: 200});
    assert.equal(r.result, 'stopped');
    assert.equal(r.crashed, false);
    assert.equal(r.initialParts, r.remainingParts);
    assert.ok(r.worst.impact > -3, JSON.stringify(r.worst));
    assert.ok(
      r.track.minAlong >= 0 && r.track.maxAlong < RUNWAY.length && r.track.maxCross < RUNWAY.width / 2
    );
  });

for (const kind of ['plane', 'plane-large', 'transport-cargo'])
  test(`${kind} late rollout guard avoids overrun caused by unconditional delay`, () => {
    const baseline = rolloutImpact({kind, touchdownAlong: 1200});
    const delayed = rolloutImpact({kind, mode: 'both', touchdownAlong: 1200});
    const guarded = rolloutImpact({kind, mode: 'guarded', touchdownAlong: 1200});
    assert.deepEqual(guarded.fixture, baseline.fixture);
    assert.deepEqual(delayed.fixture, baseline.fixture);
    assert.ok(Math.abs(guarded.fixture.along - 1200) < 0.01);
    assert.equal(delayed.result, 'failed');
    assert.ok(delayed.track.maxAlong > RUNWAY.length);
    assert.equal(baseline.result, 'stopped');
    assert.equal(guarded.result, 'stopped');
    assert.equal(guarded.touchdown.brake, true);
    assert.equal(delayed.touchdown.brake, false);
    assert.equal(guarded.crashed, false);
    assert.equal(guarded.initialParts, guarded.remainingParts);
    assert.ok(guarded.track.maxAlong < baseline.track.maxAlong);
    assert.ok(
      guarded.track.maxAlong < RUNWAY.length &&
        guarded.track.minAlong > 1190 &&
        guarded.track.maxCross < RUNWAY.width / 2
    );
    // Immediate braking prioritizes stopping distance; do not claim all impacts > -3.
    assert.ok(guarded.worst.impact > baseline.worst.impact);
  });
