import test from 'node:test';
import assert from 'node:assert/strict';
import {audioSettings, soundState} from '../dist/game-audio.js';
test('invalid saved sound settings recover and clamp independently', () => {
  assert.deepEqual(audioSettings(null), {music: 0.28, effects: 0.55, muted: false});
  assert.deepEqual(audioSettings({music: 2, effects: -1, muted: true}), {music: 1, effects: 0, muted: true});
  assert.deepEqual(audioSettings({music: 'loud', effects: NaN}), audioSettings());
});
test('engine and RCS audio follow produced forces, not throttle commands', () => {
  const f = {throttle: 1, lastThrust: 0, rcsJets: [], orbit: {altitude: 80000}};
  assert.deepEqual(soundState(f), {scene: 'space', thrust: 0, rolling: 0, jets: 0, crashed: false});
  f.lastThrust = 45000;
  f.rcsJets = [{level: 0.5}];
  assert.equal(soundState(f).thrust, 0.5);
  assert.equal(soundState(f).jets, 1);
  f.crashed = true;
  assert.equal(soundState(f).thrust, 0);
  assert.equal(soundState(f).jets, 0);
  assert.equal(soundState(null, true).scene, 'center');
  assert.equal(soundState(null).scene, 'workshop');
  f.orbit.altitude = 100;
  assert.equal(soundState(f).scene, 'flight');
});
