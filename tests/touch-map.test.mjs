import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAP_EXTENT_MIN,
  MAP_EXTENT_MAX,
  clampExtent,
  pinchExtent,
  hitRadius,
  DoubleTap,
  Pinch
} from '../dist/touch-map.js';

test('the map extent is clamped to the wheel limits', () => {
  assert.equal(clampExtent(1), MAP_EXTENT_MIN);
  assert.equal(clampExtent(1e12), MAP_EXTENT_MAX);
  assert.equal(clampExtent(5e6), 5e6);
});
test('pinching apart zooms in by the distance ratio, together zooms out', () => {
  assert.equal(pinchExtent(4e6, 100, 200), 2e6);
  assert.equal(pinchExtent(4e6, 200, 100), 8e6);
  assert.equal(pinchExtent(4e6, 100, 100), 4e6);
  assert.equal(pinchExtent(2e4, 100, 1000), MAP_EXTENT_MIN, 'zoom in stops at the wheel limit');
  assert.equal(pinchExtent(4e7, 100, 10), MAP_EXTENT_MAX, 'zoom out stops at the wheel limit');
  assert.equal(pinchExtent(4e6, 0, 100), 4e6, 'fingers starting on one point do not divide by zero');
  assert.equal(pinchExtent(4e6, 100, 0), 4e6);
});
test('a finger gets a larger hit radius, the mouse keeps its own', () => {
  for (const base of [12, 14, 22]) {
    assert.equal(hitRadius(base, 'mouse'), base);
    assert.equal(hitRadius(base, 'pen'), base);
    assert.equal(hitRadius(base, ''), base);
    assert.equal(hitRadius(base, 'touch'), Math.max(24, base * 2));
  }
  assert.equal(hitRadius(8, 'touch'), 24);
});
test('two taps close in time and place make one double tap', () => {
  const d = new DoubleTap(300, 20);
  assert.equal(d.tap(0, 50, 50), false);
  assert.equal(d.tap(250, 60, 55), true);
  assert.equal(d.tap(400, 60, 55), false, 'the pair is consumed; a third tap starts again');
  assert.equal(d.tap(800, 60, 55), false, 'too slow');
  assert.equal(d.tap(900, 100, 55), false, 'too far');
  assert.equal(d.tap(1000, 100, 55), true);
  d.tap(2000, 0, 0);
  d.reset();
  assert.equal(d.tap(2100, 0, 0), false, 'reset forgets the first tap');
});
test('two fingers pinch; one finger or a third finger does not', () => {
  const p = new Pinch();
  assert.equal(p.down(1, 100, 100, 4e6), false);
  assert.equal(p.move(1, 120, 100), null, 'one finger is not a pinch');
  assert.equal(p.down(2, 220, 100, 4e6), true, 'the second finger starts the pinch');
  assert.ok(p.active);
  assert.equal(p.move(2, 320, 100), 2e6, '100 px -> 200 px apart halves the extent');
  assert.equal(p.move(9, 0, 0), null, 'unknown pointer');
  assert.equal(p.down(3, 0, 0, 2e6), false);
  assert.equal(p.move(2, 420, 100), null, 'a third finger pauses the zoom');
  p.up(3);
  assert.equal(p.move(2, 320, 100), 2e6, 'back to two fingers, still relative to the pinch start');
  p.up(1);
  assert.equal(p.active, false);
  assert.equal(p.count, 1);
  assert.equal(p.move(2, 0, 0), null);
  p.up(2);
  assert.equal(p.count, 0);
  assert.equal(new Pinch().down(1, 0, 0, null) || new Pinch().active, false);
  const q = new Pinch();
  q.down(1, 0, 0, null);
  assert.equal(q.down(2, 10, 0, null), false, 'no extent yet: no pinch');
});
