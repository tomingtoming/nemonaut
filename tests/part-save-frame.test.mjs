import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {part, preset} from '../dist/catalog.js';
import {Flight, validateCraft} from '../dist/core.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import {worldFromFlight, flightFromWorld} from '../dist/world-save.js';
import {convertSavedPartFrame} from '../dist/part-save-frame.js';

const equalPoses = (a, b) => {
  assert.equal(a.length, b.length);
  a.forEach((p, i) => {
    assert.ok(new T.Vector3(...p.p).distanceTo(new T.Vector3(...b[i].p)) < 1e-10, p.type);
    assert.deepEqual({...p, p: []}, {...b[i], p: []});
  });
};

test('versioned centre poses use rotated nominal offsets, not live mass centres', () => {
  const types = {wing: 1, fin: 1, wingLarge: 3, transportWing: 7, transportWingRoot: 7, tank: 0};
  const parts = Object.keys(types).map(type => part(type, [4, 5, 6], [0.6, -0.8, 1.2]));
  const before = structuredClone(parts),
    encoded = convertSavedPartFrame(parts, 'encode');
  encoded.forEach((p, i) => {
    const q = new T.Quaternion().setFromEuler(new T.Euler(...p.r));
    const expected = new T.Vector3(types[p.type], 0, 0).applyQuaternion(q).add(new T.Vector3(...parts[i].p));
    assert.ok(expected.distanceTo(new T.Vector3(...p.p)) < 1e-12);
  });
  assert.deepEqual(parts, before);
  equalPoses(convertSavedPartFrame(encoded, 'decode'), parts);
});

test('legacy and centre flight saves survive repeated world roundtrips without datum drift', () => {
  const original = new Flight(preset('transport'), 'runway');
  const before = structuredClone(original.parts);
  let restored;
  try {
    let record = saveFlight(original);
    assert.equal(record.version, 2);
    assert.equal(record.partFrame, 'nominal-center-v1');
    assert.deepEqual(record.parts, original.parts);
    for (let i = 0; i < 5; i++) {
      const world = worldFromFlight(record);
      assert.equal(world.vessels[0].version, 2);
      assert.equal(world.vessels[0].partFrame, 'nominal-center-v1');
      restored = loadFlight(flightFromWorld(world));
      equalPoses(restored.parts, before);
      record = saveFlight(restored);
      restored.dispose();
      restored = undefined;
    }
    record.parts = convertSavedPartFrame(before, 'decode');
    record.version = 1;
    delete record.partFrame;
    restored = loadFlight(record);
    equalPoses(restored.parts, before);
    assert.deepEqual(original.parts, before);
  } finally {
    restored?.dispose();
    original.dispose();
  }
});

test('centre records reject unknown frames and malformed poses; valid boundary poses remain valid', () => {
  const f = new Flight(preset('plane'), 'runway');
  try {
    const base = saveFlight(f);
    for (const mutate of [
      s => (s.partFrame = 'future'),
      s => delete s.partFrame,
      s => (s.parts = null),
      s => (s.parts[0].r = null),
      s => (s.parts[0].p[0] = Infinity),
      s => (s.parts[0].p = [0]),
      s => (s.parts[0].p[0] = 20000)
    ]) {
      const record = structuredClone(base);
      mutate(record);
      assert.throws(() => loadFlight(record));
    }
    const edge = [part('wing', [9999.5, 0, 0], [0, 0, 0])];
    const encoded = convertSavedPartFrame(edge, 'encode');
    assert.ok(encoded[0].p[0] > 10000);
    equalPoses(validateCraft({version: 1, parts: encoded}), encoded);
  } finally {
    f.dispose();
  }
});

test('migration-era version 1 centre saves upgrade without moving parts', () => {
  const f = new Flight(preset('plane'), 'runway');
  let restored;
  try {
    const interim = saveFlight(f);
    interim.version = 1;
    restored = loadFlight(interim);
    equalPoses(restored.parts, f.parts);
    assert.equal(saveFlight(restored).version, 2);
  } finally {
    restored?.dispose();
    f.dispose();
  }
});

test('restoring an aircraft preserves subsequent flight motion and detached wing poses', () => {
  const f = new Flight(preset('plane'), 'orbit');
  let g;
  try {
    f.detached.push(new Flight(preset('plane-large'), 'orbit'));
    f.stageNext();
    f.throttle = 0.2;
    for (let i = 0; i < 120; i++) f.step(1 / 120);
    g = loadFlight(JSON.parse(JSON.stringify(saveFlight(f))));
    equalPoses(g.detached[0].parts, f.detached[0].parts);
    for (let i = 0; i < 240; i++) {
      f.step(1 / 120);
      g.step(1 / 120);
    }
    assert.ok(f.pos.distanceTo(g.pos) < 0.01);
    assert.ok(f.vel.distanceTo(g.vel) < 0.001);
    assert.ok(f.q.angleTo(g.q) < 1e-5);
  } finally {
    f.dispose();
    g?.dispose();
  }
});
