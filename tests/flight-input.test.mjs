import test from 'node:test';
import assert from 'node:assert/strict';
import {attitudeCommands, manualTranslation} from '../dist/flight-input.js';
test('precision changes manual attitude without changing drive or translation input', () => {
  const input = {precision: true, pitch: -1, yaw: 0.6, roll: -0.8, drive: 1, translateX: 1};
  const before = structuredClone(input);
  assert.deepEqual(attitudeCommands(input), {pitch: -0.25, yaw: 0.15, roll: -0.2});
  assert.deepEqual(input, before);
  assert.deepEqual(attitudeCommands({...input, precision: false}), {pitch: -1, yaw: 0.6, roll: -0.8});
  assert.deepEqual(attitudeCommands(input, true), {pitch: -0.25, yaw: -0.2, roll: 0.15});
  assert.deepEqual(attitudeCommands(), {pitch: 0, yaw: 0, roll: 0});
});

test('manual translation maps vessel axes while port commands stay in the selected port frame', () => {
  const keys = new Set(['KeyI', 'KeyJ', 'KeyO']);
  const port = {portForward: 0.25, portRight: -0.25, portUp: -0.25};
  assert.deepEqual(manualTranslation(keys, false, 0.25), {
    ...port,
    translateX: -1,
    translateY: -1,
    translateZ: 1
  });
  assert.deepEqual(manualTranslation(keys, true, 0.25), {
    ...port,
    translateX: -1,
    translateY: 1,
    translateZ: 1
  });
  const up = manualTranslation(new Set(['KeyU']), true, 0);
  assert.equal(up.translateZ, -1);
  assert.equal(up.portUp, 0);
});
