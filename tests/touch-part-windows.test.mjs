import test from 'node:test';
import assert from 'node:assert/strict';
import {LongPress} from '../dist/touch-part-windows.js';

function fakeTimer() {
  let next = 1;
  const pending = new Map();
  return {
    set(fire, ms) {
      pending.set(next, {fire, ms});
      return next++;
    },
    clear(id) {
      pending.delete(id);
    },
    pending,
    run() {
      const all = [...pending.values()];
      pending.clear();
      for (const {fire} of all) fire();
    }
  };
}
function recognizer(delay = 500, slop = 10) {
  const timer = fakeTimer(),
    fired = [];
  const press = new LongPress((x, y) => fired.push([x, y]), timer, delay, slop);
  return {timer, fired, press};
}

test('a finger held still fires once at the press point after the delay', () => {
  const {timer, fired, press} = recognizer();
  press.pointerDown(1, 100, 200);
  assert.equal(press.pending, true);
  assert.deepEqual(
    [...timer.pending.values()].map(t => t.ms),
    [500]
  );
  press.pointerMove(1, 104, 206); // within 10 px
  timer.run();
  assert.deepEqual(fired, [[100, 200]]);
  assert.equal(press.pending, false);
  press.pointerUp(1);
  timer.run();
  assert.deepEqual(fired, [[100, 200]], 'fires once');
});
test('moving past the slop, lifting early or a pointercancel cancels the press', () => {
  let r = recognizer();
  r.press.pointerDown(1, 0, 0);
  r.press.pointerMove(1, 8, 8); // 11.3 px
  r.timer.run();
  assert.deepEqual(r.fired, []);
  r = recognizer();
  r.press.pointerDown(1, 0, 0);
  r.press.pointerUp(1);
  assert.equal(r.timer.pending.size, 0, 'the timer is cleared');
  r.timer.run();
  assert.deepEqual(r.fired, []);
  r = recognizer();
  r.press.pointerDown(1, 0, 0);
  r.press.pointerMove(2, 500, 500); // another pointer's move does not cancel
  assert.equal(r.press.pending, true);
});
test('a second finger (pinch) cancels the press and the remaining finger does not restart it', () => {
  const {timer, fired, press} = recognizer();
  press.pointerDown(1, 10, 10);
  press.pointerDown(2, 80, 80);
  assert.equal(press.pending, false);
  press.pointerUp(2);
  timer.run();
  assert.deepEqual(fired, []);
  press.pointerUp(1);
  press.pointerDown(3, 30, 30); // a fresh single touch starts again
  timer.run();
  assert.deepEqual(fired, [[30, 30]]);
});
test('a gated touch records the finger without a press; fireNow fires a pending press early; reset forgets', () => {
  let r = recognizer();
  r.press.pointerDown(1, 0, 0, false);
  assert.equal(r.press.pending, false);
  r.press.pointerDown(2, 5, 5); // still counts as a second finger
  assert.equal(r.press.pending, false);
  r = recognizer();
  r.press.fireNow();
  assert.deepEqual(r.fired, [], 'nothing pending, nothing fired (mouse right-click contextmenu)');
  r.press.pointerDown(1, 7, 9);
  r.press.fireNow();
  assert.deepEqual(r.fired, [[7, 9]]);
  assert.equal(r.timer.pending.size, 0);
  r = recognizer();
  r.press.pointerDown(1, 0, 0);
  r.press.reset();
  r.press.pointerDown(2, 1, 1);
  assert.equal(r.press.pending, true, 'after reset a new finger is a single touch again');
});
