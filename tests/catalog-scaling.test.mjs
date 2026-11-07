import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PARTS} from '../dist/catalog.js';
import {LARGE_VARIANTS} from '../dist/large-parts.js';
import {scalingErrors, CURRENT_GEOMETRY_OVERRIDES} from '../tools/catalog-scaling.mjs';

const check = parts => scalingErrors(parts, LARGE_VARIANTS, CURRENT_GEOMETRY_OVERRIDES);
test('all installed large variants obey dimensional contracts with explicit redesigned geometry', () => {
  assert.deepEqual(check(PARTS), []);
});
for (const [id, field] of [
  ['jetLarge', 'mass'],
  ['transportJet', 'thrust'],
  ['marineCabin', 'battery'],
  ['transportFuselage', 'fuel'],
  ['hullLarge', 'planingArea'],
  ['wingLarge', 'size'],
  ['wingLarge', 'wing'],
  ['wingLarge', 'ac'],
  ['elevatorLarge', 'chord'],
  ['hullLarge', 'volume'],
  ['ballastLarge', 'ballast'],
  ['transportWingRoot', 'massCenter']
]) {
  test(`detect scaling mutation ${id}.${field}`, () => {
    const parts = structuredClone(PARTS);
    const value = parts[id][field];
    parts[id][field] = Array.isArray(value) ? value.map(v => v + 1) : value * 2;
    assert.ok(check(parts).includes(`${id}: ${field}`));
  });
}
test('redesigned inner wing cannot silently pass as a similar copy', () => {
  assert.ok(scalingErrors(PARTS, LARGE_VARIANTS).some(e => e.startsWith('transportWingRoot:')));
});
test('equal-size engines retain distinct dry masses and thrust ratings', () => {
  assert.equal(LARGE_VARIANTS.jetLarge.scale, LARGE_VARIANTS.transportJet.scale);
  assert.deepEqual([PARTS.jetLarge.mass, PARTS.jetLarge.thrust], [1150, 90000]);
  assert.deepEqual([PARTS.transportJet.mass, PARTS.transportJet.thrust], [2300, 180000]);
});
test('invalid scale, factor or base is rejected', () => {
  for (const mutation of [
    {scale: NaN},
    {scale: 0},
    {massScale: -1},
    {massScale: 'unknown'},
    {base: 'missing'}
  ]) {
    assert.deepEqual(scalingErrors(PARTS, {jetLarge: {...LARGE_VARIANTS.jetLarge, ...mutation}}), [
      'jetLarge: invalid variant'
    ]);
  }
});
