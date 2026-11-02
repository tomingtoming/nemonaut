import test from 'node:test';
import assert from 'node:assert/strict';
import {mountFlightPause} from '../dist/flight-pause.js';
import {PhysicsClock} from '../dist/physics-clock.js';
import {soundState} from '../dist/game-audio.js';

test('pause and resume discard pending keys and fractional physics demand, returning warp to one', () => {
  const nodes = new Map(),
    node = () => ({
      value: '1000',
      disabled: false,
      attributes: {},
      setAttribute(k, v) {
        this.attributes[k] = v;
      },
      closest() {
        return {after() {}};
      },
      blur() {}
    });
  const root = {
    createElement: node,
    querySelector(id) {
      if (!nodes.has(id)) nodes.set(id, node());
      return nodes.get(id);
    }
  };
  const keys = new Set(['KeyW']),
    clock = new PhysicsClock();
  let changes = 0;
  clock.advance(0.004, 1, () => {});
  const pause = mountFlightPause(root, {
    keys,
    clock,
    onChange() {
      changes++;
    }
  });
  pause.set(true);
  assert.equal(pause.paused, true);
  assert.equal(keys.size, 0);
  assert.equal(clock.remainder, 0);
  assert.equal(root.querySelector('#warp').value, '1');
  assert.equal(root.querySelector('#warp').disabled, true);
  keys.add('ShiftLeft');
  pause.toggle();
  assert.equal(keys.size, 0);
  assert.equal(pause.paused, false);
  assert.equal(root.querySelector('#warp').disabled, false);
  assert.equal(changes, 2);
  let steps = 0;
  clock.advance(1 / 120, 1, () => steps++);
  assert.equal(steps, 1);
});

test('pause silences propulsion while retaining the flight music scene and physical state', () => {
  const f = {lastThrust: 180000, rcsJets: [{level: 1}], orbit: {altitude: 80000}, crashed: false};
  const before = structuredClone(f);
  assert.equal(soundState(f).thrust, 1);
  assert.equal(soundState(f).jets, 1);
  const paused = soundState(f, false, true);
  assert.equal(paused.thrust, 0);
  assert.equal(paused.jets, 0);
  assert.equal(paused.scene, 'space');
  assert.deepEqual(f, before);
});
