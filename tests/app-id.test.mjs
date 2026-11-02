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
test('old orbital-foundry browser data moves to omnivehicle keys without overwriting newer data', () => {
  const st = memory([
    ['orbital-foundry-game-v1', 'old game'],
    ['orbital-foundry-craft', 'old craft'],
    ['omnivehicle-craft', 'new craft'],
    ['unrelated', 'x']
  ]);
  assert.equal(migrateLegacyStorage(st), 1);
  assert.deepEqual(Object.fromEntries(st.s), {
    'omnivehicle-craft': 'new craft',
    unrelated: 'x',
    'omnivehicle-game-v1': 'old game'
  });
  assert.equal(migrateLegacyStorage(st), 0, 'idempotent');
  assert.equal(migrateLegacyStorage(null), 0);
});
test('saves are written with the new kind and old kinds still load', () => {
  assert.equal(saveKind('flight'), 'omnivehicle-flight');
  assert.equal(storageKey('game-v1'), 'omnivehicle-game-v1');
  assert.ok(isSaveKind('omnivehicle-world', 'world') && isSaveKind('orbital-foundry-world', 'world'));
  assert.ok(!isSaveKind('other-world', 'world'));
});
