import test from 'node:test';
import assert from 'node:assert/strict';
import {stickVector, stickCodes, TouchKeys} from '../dist/touch-flight.js';

test('the stick vector is clamped to the unit disc with y up', () => {
  assert.deepEqual(stickVector(0, 0, 50), {x: 0, y: 0});
  assert.deepEqual(stickVector(25, -25, 50), {x: 0.5, y: 0.5});
  const far = stickVector(300, 0, 50);
  assert.equal(far.x, 1);
  assert.equal(Math.abs(far.y), 0);
  const diagonal = stickVector(100, 100, 50);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-12);
  assert.deepEqual(stickVector(10, 10, 0), {x: 0, y: 0}, 'a collapsed stick reads as centred');
});
test('stick directions map to the keyboard keys W/S/A/D past the dead zone', () => {
  assert.deepEqual(stickCodes({x: 0, y: 0}), []);
  assert.deepEqual(stickCodes({x: 0.2, y: -0.3}), [], 'inside the dead zone');
  assert.deepEqual(stickCodes({x: 0, y: 1}), ['KeyW']);
  assert.deepEqual(stickCodes({x: 0, y: -1}), ['KeyS']);
  assert.deepEqual(stickCodes({x: -1, y: 0}), ['KeyA']);
  assert.deepEqual(stickCodes({x: 1, y: 0}), ['KeyD']);
  assert.deepEqual(stickCodes({x: Math.SQRT1_2, y: Math.SQRT1_2}), ['KeyW', 'KeyD'], 'diagonals hold both');
});
test('touch keys emit a key event only when the held union changes and release everything', () => {
  const events = [];
  const keys = new TouchKeys((type, code, repeat) => events.push(`${type}:${code}${repeat ? ':r' : ''}`));
  keys.set(1, ['KeyW']);
  keys.set(1, ['KeyW', 'KeyD']);
  keys.set(2, ['KeyZ']);
  keys.set(3, ['KeyD']);
  assert.deepEqual(events, ['keydown:KeyW', 'keydown:KeyD', 'keydown:KeyZ']);
  events.length = 0;
  keys.release(1);
  assert.deepEqual(events, ['keyup:KeyW'], 'KeyD stays held by pointer 3');
  events.length = 0;
  keys.repeat();
  assert.deepEqual(events.sort(), ['keydown:KeyD:r', 'keydown:KeyZ:r']);
  events.length = 0;
  keys.releaseAll();
  assert.deepEqual(events.sort(), ['keyup:KeyD', 'keyup:KeyZ']);
  assert.equal(keys.held().size, 0);
  events.length = 0;
  keys.releaseAll();
  keys.release(9);
  keys.repeat();
  assert.deepEqual(events, [], 'releasing nothing emits nothing');
});
