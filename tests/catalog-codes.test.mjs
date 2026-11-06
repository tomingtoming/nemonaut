import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PARTS} from '../dist/catalog.js';
import {codeFamilyErrors} from '../tools/catalog-codes.mjs';

test('catalog has no cross-category prefix exceptions', () => {
  assert.deepEqual(codeFamilyErrors(PARTS), []);
});
test('same-category size variants may share a prefix', () => {
  assert.deepEqual(codeFamilyErrors({a: PARTS.tank, b: PARTS.tankLarge}), []);
});
test('new cross-category reuse is detected', () => {
  assert.match(codeFamilyErrors({a: PARTS.tank, b: {...PARTS.engine, code: 'FT-99'}})[0], /FT: mixed/);
});
test('fuel family model numbers specify kilograms and turbofans specify kilonewtons', () => {
  for (const part of Object.values(PARTS)) {
    const [prefix, number] = part.code.split('-');
    if (['FT', 'AF'].includes(prefix)) assert.equal(Number(number), part.fuel, part.code);
    if (prefix === 'TF') assert.equal(Number(number) * 1000, part.thrust, part.code);
  }
  assert.equal(PARTS.rcs.code, 'RCS-6');
  assert.equal(PARTS.parachute.code, 'PC-14');
});

test('malformed model numbers are rejected', () => {
  for (const code of ['', 'FT', 'FT-', 'ft-1', 'FT-NaN', ' FT-1']) {
    assert.ok(codeFamilyErrors({bad: {...PARTS.tank, code}}).includes('bad: invalid model code'));
  }
});
