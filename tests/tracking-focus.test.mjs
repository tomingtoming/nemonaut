import test from 'node:test';
import assert from 'node:assert/strict';
import {trackingRadius} from '../dist/tracking-map.js';
test('selected orbital extent is independent of a distant escape craft', () => {
  const low = {
      id: 'low',
      position: [0, 680000, 0],
      segments: [
        [
          [0, 680000, 0],
          [0, 0, 680000]
        ]
      ]
    },
    far = {id: 'far', position: [0, 263340960, 0], segments: []};
  assert.equal(trackingRadius([low, far]), 263340960 * 1.15);
  assert.equal(trackingRadius([low]), 680000 * 1.15);
  const eccentric = {
    position: [0, 680000, 0],
    segments: [
      [
        [0, 10000000, 0],
        [0, 9990000, 0]
      ]
    ]
  };
  assert.equal(trackingRadius([eccentric]), 10800000);
  assert.equal(trackingRadius([]), 780000);
});
