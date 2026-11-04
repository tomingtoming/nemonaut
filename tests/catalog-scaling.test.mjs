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
test('mass/thrust tuning does not pretend to enforce constant density', () => {
  const parts = structuredClone(PARTS);
  parts.jetLarge.mass *= 2;
  parts.jetLarge.thrust *= 3;
  assert.deepEqual(check(parts), []);
});
test('invalid scale, factor or base is rejected', () => {
  for (const mutation of [{scale: NaN}, {scale: 0}, {factor: -1}, {base: 'missing'}]) {
    assert.deepEqual(scalingErrors(PARTS, {jetLarge: {...LARGE_VARIANTS.jetLarge, ...mutation}}), [
      'jetLarge: invalid variant'
    ]);
  }
});
