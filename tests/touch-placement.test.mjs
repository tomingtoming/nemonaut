import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TouchPlacementTaps,
  sameView,
  wireTouchGizmoSize,
  TOUCH_COMMIT_RADIUS,
  TOUCH_GIZMO_SCALE
} from '../dist/touch-placement.js';

const view = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 4, 5, 1];
const poser = targets => {
  const calls = [];
  return {calls, pose: (x, y) => () => (calls.push([x, y]), targets(x, y))};
};

test('first tap previews, a second tap near it commits without re-posing', () => {
  const taps = new TouchPlacementTaps(),
    p = poser(() => null);
  assert.equal(taps.tap(100, 100, view, p.pose(100, 100)), 'preview');
  assert.equal(taps.previewing, true);
  assert.equal(taps.tap(100 + TOUCH_COMMIT_RADIUS - 1, 100, view, p.pose(129, 100)), 'commit');
  assert.deepEqual(p.calls, [[100, 100]]);
  assert.equal(taps.previewing, false);
  // After a commit the next tap previews again (no double placement from a double tap).
  assert.equal(taps.tap(100, 100, view, p.pose(100, 100)), 'preview');
});

test('a tap elsewhere moves the preview instead of committing', () => {
  const taps = new TouchPlacementTaps(),
    p = poser(() => null);
  assert.equal(taps.tap(100, 100, view, p.pose(100, 100)), 'preview');
  assert.equal(taps.tap(200, 100, view, p.pose(200, 100)), 'preview');
  assert.equal(taps.tap(105, 100, view, p.pose(105, 100)), 'preview');
  assert.equal(taps.tap(110, 104, view, p.pose(110, 104)), 'commit');
});

test('a tap on the same attachment node commits even far from the first tap', () => {
  const taps = new TouchPlacementTaps(),
    p = poser(x => (x < 300 ? 'root:2' : 'root:3'));
  assert.equal(taps.tap(100, 100, view, p.pose(100, 100)), 'preview');
  assert.equal(taps.tap(250, 100, view, p.pose(250, 100)), 'commit');
  assert.equal(taps.tap(100, 100, view, p.pose(100, 100)), 'preview');
  assert.equal(taps.tap(400, 100, view, p.pose(400, 100)), 'preview');
});

test('after the camera moved, nearness alone does not commit; the same node still does', () => {
  const taps = new TouchPlacementTaps(),
    moved = view.map((v, i) => (i === 12 ? v + 0.5 : v));
  assert.equal(
    taps.tap(100, 100, view, () => null),
    'preview'
  );
  assert.equal(
    taps.tap(100, 100, moved, () => null),
    'preview'
  );
  assert.equal(
    taps.tap(100, 100, view, () => 'a:0'),
    'preview'
  );
  assert.equal(
    taps.tap(100, 100, moved, () => 'a:0'),
    'commit'
  );
  assert.equal(
    taps.tap(100, 100, view, () => 'a:0'),
    'preview'
  );
  assert.equal(
    taps.tap(100, 100, moved, () => 'a:1'),
    'preview'
  );
});

test('a tap with no valid pose places nothing and clears the preview', () => {
  const taps = new TouchPlacementTaps();
  assert.equal(
    taps.tap(100, 100, view, () => undefined),
    'none'
  );
  assert.equal(taps.previewing, false);
  assert.equal(
    taps.tap(100, 100, view, () => null),
    'preview'
  );
  assert.equal(
    taps.tap(300, 300, view, () => undefined),
    'none'
  );
  assert.equal(
    taps.tap(100, 100, view, () => null),
    'preview'
  );
  taps.reset();
  assert.equal(
    taps.tap(100, 100, view, () => null),
    'preview'
  );
});

test('sameView tolerates sub-millimetre drift only', () => {
  assert.equal(sameView(view, view), true);
  assert.equal(
    sameView(
      view,
      view.map(v => v + 5e-4)
    ),
    true
  );
  assert.equal(
    sameView(
      view,
      view.map(v => v + 5e-3)
    ),
    false
  );
  assert.equal(sameView(view, view.slice(1)), false);
});

test('the gizmo grows on touch devices and keeps its size with a mouse', () => {
  const media = matches => {
    let listener = null;
    const query = {matches, addEventListener: (_, f) => (listener = f)};
    return {query, fire: () => listener?.(), fn: () => query};
  };
  const gizmo = () => ({
    size: 0.8,
    setSize(s) {
      this.size = s;
    }
  });
  const mouse = gizmo(),
    m = media(false);
  wireTouchGizmoSize(mouse, m.fn);
  assert.equal(mouse.size, 0.8);
  const touch = gizmo(),
    t = media(true);
  wireTouchGizmoSize(touch, t.fn);
  assert.ok(Math.abs(touch.size - 0.8 * TOUCH_GIZMO_SCALE) < 1e-12);
  t.query.matches = false;
  t.fire();
  assert.equal(touch.size, 0.8);
  wireTouchGizmoSize(gizmo(), undefined);
});
