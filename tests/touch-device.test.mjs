import test from 'node:test';
import assert from 'node:assert/strict';
import {isTouchDevice, watchTouchDevice, TOUCH_QUERY} from '../dist/touch-device.js';

const fakeMedia = initial => {
  let matches = initial;
  const listeners = [];
  const media = query => {
    assert.equal(query, TOUCH_QUERY);
    return {
      get matches() {
        return matches;
      },
      addEventListener: (_type, fn) => listeners.push(fn)
    };
  };
  media.set = value => {
    matches = value;
    for (const fn of listeners) fn();
  };
  return media;
};
const fakeBody = () => {
  const classes = new Set();
  return {classes, classList: {toggle: (name, on) => (on ? classes.add(name) : classes.delete(name), on)}};
};

test('a coarse pointer without hover is a touch device; no matchMedia means not', () => {
  assert.equal(isTouchDevice(fakeMedia(true)), true);
  assert.equal(isTouchDevice(fakeMedia(false)), false);
  assert.equal(isTouchDevice(undefined), false);
});
test('the body class follows the media query', () => {
  const media = fakeMedia(false),
    body = fakeBody();
  watchTouchDevice(body, media);
  assert.equal(body.classes.has('touch'), false, 'desktop: unchanged');
  media.set(true);
  assert.equal(body.classes.has('touch'), true);
  media.set(false);
  assert.equal(body.classes.has('touch'), false);
});
