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
test('model numbers use the same catalog quantity throughout each variant family', () => {
  const families = [
    [['FT', 'AF'], part => part.fuel], // kg
    [['RE', 'SL', 'VX', 'TJ', 'TF', 'MP'], part => part.thrust / 1000], // kN
    [['AD', 'DC'], part => Math.max(...part.stackDiameters) * 100], // larger mating diameter, cm
    [['SW', 'RF', 'ST', 'EL', 'FP', 'AL', 'RD', 'WI', 'TW', 'TS', 'TE'], part => part.size[0]], // span, m
    [['NG', 'MG', 'RW'], part => part.size[1]], // wheel diameter, m
    [['FC', 'MC'], part => part.size[1]], // cabin length, m
    [['BT'], part => part.ballast / 1000] // ballast capacity, tonnes
  ];
  const quantities = new Map(
    families.flatMap(([prefixes, quantity]) => prefixes.map(prefix => [prefix, quantity]))
  );
  const seen = new Set();
  for (const part of Object.values(PARTS)) {
    const [prefix, number] = part.code.split('-');
    const quantity = quantities.get(prefix);
    if (seen.has(prefix)) assert.ok(quantity, 'Define the number for the new variant family ' + prefix);
    seen.add(prefix);
    if (quantity) assert.ok(Math.abs(Number(number) - quantity(part)) < 1e-9, part.code);
  }
  assert.equal(PARTS.rcs.code, 'RCS-6');
  assert.equal(PARTS.parachute.code, 'PC-14');
});

test('malformed model numbers are rejected', () => {
  for (const code of ['', 'FT', 'FT-', 'ft-1', 'FT-NaN', ' FT-1']) {
    assert.ok(codeFamilyErrors({bad: {...PARTS.tank, code}}).includes('bad: invalid model code'));
  }
});
