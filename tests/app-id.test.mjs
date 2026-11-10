import test from 'node:test';
import assert from 'node:assert/strict';
import {isSaveKind, saveKind, storageKey} from '../dist/app-id.js';
test('saves are written with the new kind and earlier kinds still load', () => {
  assert.equal(saveKind('flight'), 'nemonaut-flight');
  assert.equal(storageKey('game-v1'), 'nemonaut-game-v1');
  assert.ok(isSaveKind('nemonaut-world', 'world'));
  assert.ok(isSaveKind('omnivehicle-world', 'world') && isSaveKind('orbital-foundry-world', 'world'));
  assert.ok(!isSaveKind('other-world', 'world'));
});
