import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {FailureVisuals, failureEnvelope} from '../dist/failure-visuals.js';
const event = (id = 'a', effect = 'fuel-burst') => ({
  id,
  effect,
  time: 10,
  fuel: 1800,
  position: [0, 4, 0],
  velocity: [0, 0, 0]
});
test('effects pause with simulation time, expire after reload, and never alter flight data', () => {
  const scene = new T.Scene(),
    v = new FailureVisuals(scene),
    f = {universalTime: 10.2, failureEvents: [event()], detached: []},
    before = structuredClone(f);
  v.update(f);
  assert.equal(v.items.size, 1);
  assert.deepEqual(f, before);
  const p = scene.children[0].children[0].position.clone();
  v.update(f);
  assert.deepEqual(scene.children[0].children[0].position, p);
  f.universalTime = 19;
  v.update(f);
  assert.equal(scene.children.length, 0);
  v.update(f);
  assert.equal(scene.children.length, 0);
  f.universalTime = 10.2;
  v.update(f);
  assert.equal(v.items.size, 1);
  v.update(null);
  assert.equal(scene.children.length, 0);
  v.dispose();
});
test('dry failure has no smoke and many events have a strict rendering bound', () => {
  assert.equal(failureEnvelope(event('dry', 'fragments'), 10.5).smoke, 0);
  const scene = new T.Scene(),
    v = new FailureVisuals(scene);
  v.update({
    universalTime: 10.2,
    detached: [],
    failureEvents: Array.from({length: 64}, (_, i) => event(String(i)))
  });
  assert.equal(v.items.size, 16);
  assert.equal(
    scene.children.reduce((n, g) => n + g.children.length, 0),
    512
  );
  v.dispose();
  assert.equal(scene.children.length, 0);
});
