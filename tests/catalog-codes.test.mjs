import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PARTS} from '../dist/catalog.js';
import {codeFamilyErrors, KNOWN_CODE_CONFLICTS} from '../tools/catalog-codes.mjs';

test('catalog has only the two explicitly recorded cross-category prefixes', () => {
  assert.deepEqual(codeFamilyErrors(PARTS, KNOWN_CODE_CONFLICTS), []);
  assert.equal(codeFamilyErrors(PARTS).length, 2);
});
test('same-category size variants may share a prefix', () => {
  assert.deepEqual(codeFamilyErrors({a: PARTS.tank, b: PARTS.tankLarge}), []);
});
test('new cross-category reuse is detected', () => {
  assert.match(codeFamilyErrors({a: PARTS.tank, b: {...PARTS.engine, code: 'FT-99'}})[0], /FT: mixed/);
});
test('existing exception cannot silently admit another member', () => {
  const parts = {...PARTS, extra: {...PARTS.jet, code: 'TF-999'}};
  assert.match(codeFamilyErrors(parts, KNOWN_CODE_CONFLICTS)[0], /TF: mixed/);
});
test('changing a grandfathered member category is detected', () => {
  const parts = {...PARTS, rcs: {...PARTS.rcs, cat: '構造'}};
  assert.match(codeFamilyErrors(parts, KNOWN_CODE_CONFLICTS)[0], /RC: mixed/);
});
test('resolved conflict requires removing its exception', () => {
  const parts = {...PARTS, parachute: {...PARTS.parachute, code: 'PC-14'}};
  assert.ok(codeFamilyErrors(parts, KNOWN_CODE_CONFLICTS).includes('RC: obsolete conflict exception'));
  assert.deepEqual(codeFamilyErrors(parts, {TF: KNOWN_CODE_CONFLICTS.TF}), []);
});
test('removed prefix cannot leave a stale exception', () => {
  assert.deepEqual(codeFamilyErrors({}, {RC: KNOWN_CODE_CONFLICTS.RC}), ['RC: obsolete conflict exception']);
});
test('malformed model numbers are rejected', () => {
  for (const code of ['', 'FT', 'FT-', 'ft-1', 'FT-NaN', ' FT-1']) {
    assert.ok(codeFamilyErrors({bad: {...PARTS.tank, code}}).includes('bad: invalid model code'));
  }
});
