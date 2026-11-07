import test from 'node:test';
import assert from 'node:assert/strict';
import {WORKSPACE_KEY, workspaceRecord} from '../dist/workspace-save.js';
import {GAME_KEY, readStoredGame, writeStoredGame, backupStoredGame} from '../dist/game-storage.js';
import {editingParts, migrateWorkspace} from '../dist/game-save.js';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {saveFlight} from '../dist/flight-save.js';
import {flightFromWorld} from '../dist/world-save.js';

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
  workspaceRecord({parts: [], name: 'Next craft', bay: 'vab', environment: 'land', universalTime: time});

test('old workspace migrates to new key while original and independent flight quicksave remain untouched', () => {
  const f = new Flight(preset('twin'), 'orbit', 4000),
    s = storage();
  try {
    f.stageNext();
    f.stageNext();
    f.step(1 / 120);
    const legacy = workspaceRecord({
        parts: preset('plane'),
        name: 'Draft',
        bay: 'sph',
        environment: 'runway',
        flight: saveFlight(f)
      }),
      raw = JSON.stringify(legacy);
    s.setItem(WORKSPACE_KEY, raw);
    s.setItem('flight-quicksave', 'unrelated');
    const before = new Map(s.values),
      loaded = readStoredGame(s);
    assert.equal(loaded.migrated, true);
    assert.deepEqual(s.values, before);
    writeStoredGame(s, loaded.game);
    assert.equal(s.getItem(WORKSPACE_KEY), raw);
    assert.equal(s.getItem('flight-quicksave'), 'unrelated');
    const next = readStoredGame(s);
    assert.equal(next.migrated, false);
    assert.equal(next.game.world.vessels.length, 2);
    assert.equal(next.game.world.universalTime, f.universalTime);
    assert.deepEqual(editingParts(next.game), legacy.parts);
    const flight = flightFromWorld(next.game.world);
    assert.equal(flight.vesselId, f.vesselId);
    assert.deepEqual(flight.fuel, saveFlight(f).fuel);
  } finally {
    f.dispose();
  }
});

test('current world wins over stale legacy data, including empty world after final recovery', () => {
  const s = storage();
  s.setItem(WORKSPACE_KEY, JSON.stringify(empty(100)));
  writeStoredGame(s, migrateWorkspace(empty(500)));
  assert.equal(readStoredGame(s).game.world.universalTime, 500);
  s.setItem(GAME_KEY, '{broken');
  const before = new Map(s.values);
  assert.throws(() => readStoredGame(s));
  assert.deepEqual(s.values, before);
  s.setItem(GAME_KEY, '');
  assert.throws(() => readStoredGame(s));
});

test('quota failures leave old/current saves intact and corrupt new data is never written', () => {
  const s = storage(),
    first = migrateWorkspace(empty(100)),
    next = migrateWorkspace(empty(200));
  s.setItem(WORKSPACE_KEY, JSON.stringify(empty(90)));
  writeStoredGame(s, first);
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
  s.setItem(WORKSPACE_KEY, 'broken legacy');
  const a = backupStoredGame(s, 10),
    b = backupStoredGame(s, 10);
  assert.notEqual(a, b);
  assert.equal(s.getItem(a), 'broken legacy');
  s.setItem(GAME_KEY, 'broken current');
  const c = backupStoredGame(s, 10);
  assert.equal(s.getItem(c), 'broken current');
  assert.equal(s.getItem(WORKSPACE_KEY), 'broken legacy');
  const before = new Map(s.values);
  s.fail = true;
  assert.throws(() => backupStoredGame(s, 20));
  assert.deepEqual(s.values, before);
});

test('absent or oversized saves do not silently become a default game', () => {
  const s = storage();
  assert.equal(readStoredGame(s), null);
  s.setItem(WORKSPACE_KEY, 'x'.repeat(4000001));
  assert.throws(() => readStoredGame(s), /大きすぎ/);
  s.setItem(GAME_KEY, 'x'.repeat(4000001));
  assert.throws(() => readStoredGame(s), /大きすぎ/);
});
