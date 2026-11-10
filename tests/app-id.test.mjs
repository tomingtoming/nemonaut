import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyStorage, isSaveKind, saveKind, storageKey} from '../dist/app-id.js';
const memory = entries => {
  const s = new Map(entries);
  return {
    s,
    get length() {
      return s.size;
    },
    key: i => [...s.keys()][i] ?? null,
    getItem: k => (s.has(k) ? s.get(k) : null),
    setItem: (k, v) => s.set(k, String(v)),
    removeItem: k => s.delete(k)
  };
};
test('browser data saved under earlier names moves to nemonaut keys, newest name first', () => {
  const st = memory([
    ['orbital-foundry-game-v1', 'oldest game'],
    ['orbital-foundry-craft', 'oldest craft'],
    ['orbital-foundry-lang', 'oldest lang'],
    ['omnivehicle-craft', 'old craft'],
    ['omnivehicle-lang', 'old lang'],
    ['nemonaut-lang', 'new lang'],
    ['unrelated', 'x']
  ]);
  assert.equal(migrateLegacyStorage(st), 2);
  assert.deepEqual(Object.fromEntries(st.s), {
    'nemonaut-lang': 'new lang',
    unrelated: 'x',
    'nemonaut-craft': 'old craft',
    'nemonaut-game-v1': 'oldest game'
  });
  assert.equal(migrateLegacyStorage(st), 0, 'idempotent');
  assert.equal(migrateLegacyStorage(null), 0);
});
test('saves are written with the new kind and earlier kinds still load', () => {
  assert.equal(saveKind('flight'), 'nemonaut-flight');
  assert.equal(storageKey('game-v1'), 'nemonaut-game-v1');
  assert.ok(isSaveKind('nemonaut-world', 'world'));
  assert.ok(isSaveKind('omnivehicle-world', 'world') && isSaveKind('orbital-foundry-world', 'world'));
  assert.ok(!isSaveKind('other-world', 'world'));
});
