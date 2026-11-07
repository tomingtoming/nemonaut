import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {part, preset} from '../dist/catalog.js';
import {editingParts, gameRecord, validateGame, writeGame} from '../dist/game-save.js';
import {worldFromFlight} from '../dist/world-save.js';
import {Flight} from '../dist/core.js';
import {saveFlight} from '../dist/flight-save.js';
import {readStoredGame, writeStoredGame, GAME_KEY} from '../dist/game-storage.js';
const draft = () => ({
  name: 'work in progress',
  parts: preset('transport'),
  bay: 'sph',
  environment: 'runway'
});
const equalParts = (a, b) =>
  a.forEach((p, i) => {
    assert.ok(new T.Vector3(...p.p).distanceTo(new T.Vector3(...b[i].p)) < 1e-10);
    assert.deepEqual({...p, p: []}, {...b[i], p: []});
  });
test('game writer changes only workshop coordinates and repeated storage resumes preserve the world', () => {
  const flight = new Flight(preset('plane'), 'orbit', 1234);
  try {
    const original = gameRecord({world: worldFromFlight(saveFlight(flight)), draft: draft()}),
      before = structuredClone(original);
    let raw = null;
    const storage = {
      getItem: () => raw,
      setItem: (key, value) => {
        assert.equal(key, GAME_KEY);
        raw = value;
      }
    };
    let game = original;
    for (let i = 0; i < 5; i++) {
      writeStoredGame(storage, game);
      const encoded = JSON.parse(raw);
      assert.equal(encoded.version, 2);
      assert.equal(encoded.partFrame, 'nominal-center-v1');
      assert.deepEqual(encoded.workshop.parts, original.workshop.parts);
      assert.deepEqual(encoded.world, before.world);
      game = readStoredGame(storage).game;
      equalParts(game.workshop.parts, before.workshop.parts);
      assert.deepEqual(game.world, before.world);
    }
    assert.deepEqual(original, before);
  } finally {
    flight.dispose();
  }
});
test('empty drafts and legacy games remain valid and invalid frame combinations reject', () => {
  const legacy = gameRecord({
    world: worldFromFlight(null, {universalTime: 9}),
    draft: {...draft(), parts: []}
  });
  assert.deepEqual(validateGame(writeGame(legacy)), legacy);
  const encoded = writeGame(gameRecord({world: legacy.world, draft: draft()}));
  for (const mutate of [
    s => delete s.partFrame,
    s => (s.version = 99),
    s => (s.version = 1),
    s => (s.partFrame = 'future'),
    s => (s.workshop.parts = null),
    s => (s.workshop.parts[0].p = [NaN, 0, 0])
  ]) {
    const bad = structuredClone(encoded);
    mutate(bad);
    const before = structuredClone(bad);
    assert.throws(() => validateGame(bad));
    assert.deepEqual(bad, before);
  }
});

test('legacy game migrates a near-limit wing once and retains its exact centered save coordinates', () => {
  const parts = [part('transportWing', [9999.75, 0, 0])];
  const current = gameRecord({world: worldFromFlight(null), draft: {...draft(), parts}});
  const legacy = {...current, version: 1, workshop: {...current.workshop, parts}};
  delete legacy.partFrame;
  let game = validateGame(legacy);
  assert.equal(game.workshop.parts[0].p[0], 10006.75);
  for (let i = 0; i < 5; i++) {
    game = validateGame(JSON.parse(JSON.stringify(writeGame(game))));
    assert.deepEqual(game, current);
    assert.deepEqual(editingParts(game), parts);
  }
});
