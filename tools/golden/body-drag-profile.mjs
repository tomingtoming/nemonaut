import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {preset} from '../../dist/catalog.js';
import {createBodyAerodynamics} from './body-drag-reference.mjs';

const winds = Array.from({length: 128}, (_, i) => {
  const a = (2 * Math.PI * i) / 128;
  return new Vector3(Math.sin(a), 0.3 * Math.cos(a * 3), Math.cos(a));
});
for (const kind of ['launcher', 'plane', 'transport-cargo']) {
  const parts = preset(kind);
  const extended = createBodyAerodynamics(parts);
  const folded = createBodyAerodynamics(parts, false);
  const expected = winds.map((wind, i) => (i % 2 ? folded : extended).dragArea(wind));
  const cases = {
    rebuild: i => createBodyAerodynamics(parts, i % 2 === 0).maxCdArea,
    cached: () => extended.dragArea(winds[0]),
    changingWind: i => extended.dragArea(winds[i]),
    rebuildAndQuery: i => createBodyAerodynamics(parts, i % 2 === 0).dragArea(winds[i])
  };
  for (let i = 0; i < winds.length; i++) assert.equal(cases.rebuildAndQuery(i), expected[i]);
  for (const [name, run] of Object.entries(cases)) {
    const timings = [];
    let sum = 0;
    for (let round = 0; round < 8; round++) {
      const start = performance.now();
      for (let i = 0; i < winds.length; i++) sum += run(i);
      if (round >= 3) timings.push(performance.now() - start);
    }
    assert.ok(Number.isFinite(sum) && sum > 0);
    console.log(kind, name, 'ms per 128 operations', timings.sort((a, b) => a - b)[2].toFixed(3));
  }
}
