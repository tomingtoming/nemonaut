import test from 'node:test';
import assert from 'node:assert/strict';
import {GAME_KEY, readStoredGame, writeStoredGame, backupStoredGame} from '../dist/game-storage.js';
import {editingParts, gameRecord} from '../dist/game-save.js';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {saveFlight} from '../dist/flight-save.js';
import {flightFromWorld, worldFromFlight} from '../dist/world-save.js';

function storage() {
  const values = new Map();
  return {
    values,
    fail: false,
    getItem: key => values.get(key) ?? null,
    setItem(key, value) {
      if (this.fail) throw Error('QuotaExceededError');
      values.set(key, value);
    }
  };
}
const empty = time =>
  gameRecord({
    world: worldFromFlight(null, {universalTime: time}),
    draft: {parts: [], name: 'Next craft', bay: 'vab', environment: 'land'}
  });

test('a written game reads back with its world, draft and flight, leaving other keys untouched', () => {
  const f = new Flight(preset('twin'), 'orbit', 4000),
    s = storage();
  try {
    f.stageNext();
    f.stageNext();
    f.step(1 / 120);
    const draft = preset('plane');
    s.setItem('flight-quicksave', 'unrelated');
    writeStoredGame(
      s,
      gameRecord({
        world: worldFromFlight(saveFlight(f)),
        draft: {parts: draft, name: 'Draft', bay: 'sph', environment: 'runway'}
      })
    );
    assert.equal(s.getItem('flight-quicksave'), 'unrelated');
    const next = readStoredGame(s);
    assert.equal(next.world.vessels.length, 2);
    assert.equal(next.world.universalTime, f.universalTime);
    assert.deepEqual(editingParts(next), draft);
    const flight = flightFromWorld(next.world);
    assert.equal(flight.vesselId, f.vesselId);
    assert.deepEqual(flight.fuel, saveFlight(f).fuel);
  } finally {
    f.dispose();
  }
});

test('a broken current save is reported, never replaced by a default game', () => {
  const s = storage();
  writeStoredGame(s, empty(500));
  assert.equal(readStoredGame(s).world.universalTime, 500);
  s.setItem(GAME_KEY, '{broken');
  const before = new Map(s.values);
  assert.throws(() => readStoredGame(s));
  assert.deepEqual(s.values, before);
  s.setItem(GAME_KEY, '');
  assert.throws(() => readStoredGame(s));
});

test('quota failures leave the current save intact and corrupt new data is never written', () => {
  const s = storage(),
    next = empty(200);
  writeStoredGame(s, empty(100));
  const before = new Map(s.values);
  s.fail = true;
  assert.throws(() => writeStoredGame(s, next), /Quota/);
  assert.deepEqual(s.values, before);
  s.fail = false;
  next.world.universalTime = -1;
  assert.throws(() => writeStoredGame(s, next));
  assert.deepEqual(s.values, before);
});

test('backup retains exact broken bytes and never overwrites an existing backup', () => {
  const s = storage();
  assert.equal(backupStoredGame(s, 10), null);
  s.setItem(GAME_KEY, 'broken current');
  const a = backupStoredGame(s, 10),
    b = backupStoredGame(s, 10);
  assert.notEqual(a, b);
  assert.equal(s.getItem(a), 'broken current');
  assert.equal(s.getItem(b), 'broken current');
  const before = new Map(s.values);
  s.fail = true;
  assert.throws(() => backupStoredGame(s, 20));
  assert.deepEqual(s.values, before);
});

test('absent or oversized saves do not silently become a default game', () => {
  const s = storage();
  assert.equal(readStoredGame(s), null);
  s.setItem(GAME_KEY, 'x'.repeat(4000001));
  assert.throws(() => readStoredGame(s), /大きすぎ/);
});
