import test from 'node:test';
import assert from 'node:assert/strict';
import {renderQuality, TOUCH_PIXEL_RATIO_CAP} from '../dist/render-quality.js';

test('desktop keeps the earlier renderer settings for every pixel ratio and renderer', () => {
  for (const role of ['main', 'center', undefined])
    for (const dpr of [0.5, 1, 1.25, 1.5, 2, 2.625, 3, 4])
      assert.deepEqual(renderQuality(false, dpr, role), {
        pixelRatio: Math.min(dpr, 2),
        shadowMapSize: 2048,
        shadowType: 'pcf-soft',
        antialias: true,
        releaseUnusedContexts: false
      });
});

test('touch caps the pixel ratio per renderer and uses smaller, cheaper shadows', () => {
  assert.deepEqual(TOUCH_PIXEL_RATIO_CAP, {main: 1.5, center: 1.25});
  const phone = renderQuality(true, 2.625);
  assert.deepEqual(phone, {
    pixelRatio: 1.5,
    shadowMapSize: 1024,
    shadowType: 'pcf',
    antialias: true,
    releaseUnusedContexts: true
  });
  assert.equal(renderQuality(true, 2.625, 'center').pixelRatio, 1.25);
  assert.equal(renderQuality(true, 3, 'main').pixelRatio, 1.5);
  // A low-density screen is never raised to the cap.
  assert.equal(renderQuality(true, 1).pixelRatio, 1);
  assert.equal(renderQuality(true, 1.25, 'main').pixelRatio, 1.25);
  for (const dpr of [1, 1.5, 2, 3])
    assert.ok(renderQuality(true, dpr).pixelRatio <= renderQuality(false, dpr).pixelRatio);
});

test('an unusable device pixel ratio falls back to 1', () => {
  for (const dpr of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(renderQuality(true, dpr).pixelRatio, 1);
    assert.equal(renderQuality(false, dpr).pixelRatio, 1);
  }
});
