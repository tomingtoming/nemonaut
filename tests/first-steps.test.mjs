import test from 'node:test';
import assert from 'node:assert/strict';
import {isFirstVisit, ignitionHint, FIRST_STEPS} from '../dist/first-steps.js';

test('the first-visit path shows only before anything is flown, held or saved', () => {
  assert.equal(isFirstVisit({}), true);
  assert.equal(isFirstVisit({historyCount: 0, vesselCount: 0, designCount: 0}), true);
  assert.equal(isFirstVisit({historyCount: 1}), false);
  assert.equal(isFirstVisit({vesselCount: 1}), false);
  assert.equal(isFirstVisit({designCount: 2}), false);
  assert.equal(FIRST_STEPS.length, 3);
});
test('the first ignition at zero throttle says how to throttle up', () => {
  assert.match(ignitionHint({firstStage: true, throttle: 0}), /Z/);
  assert.equal(ignitionHint({firstStage: true, throttle: 1}), '', 'throttle already up');
  assert.equal(
    ignitionHint({firstStage: false, throttle: 0}),
    '',
    'later stages at zero throttle are normal (planned burns)'
  );
});
test('on touch the ignition hint names the on-screen buttons, not keys', () => {
  const hint = ignitionHint({firstStage: true, throttle: 0, touch: true});
  assert.doesNotMatch(hint, /Z|X/);
  assert.match(hint, /全推力/);
  assert.equal(ignitionHint({firstStage: true, throttle: 1, touch: true}), '');
});
