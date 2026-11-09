import {createBodyAerodynamics as referenceModel} from './body-drag-reference.mjs';
import assert from 'node:assert/strict';

import {Vector3} from 'three';
import {PARTS, preset, part} from '../../dist/catalog.js';
import {createBodyAerodynamics} from '../../dist/body-drag.js';

const winds = Array.from({length: 128}, (_, i) => {
  const a = (2 * Math.PI * i) / 128;
  return new Vector3(Math.sin(a), 0.3 * Math.cos(a * 3), Math.cos(a));
});
const forward = new Vector3(0, 0, 1);
const tiny = new Vector3(0.000999, 0, 1);
const larger = new Vector3(0.001001, 0, 1);
const directions = [forward, tiny, new Vector3(), larger, ...winds, forward];
function compare(label, parts, deployed = true, timed = false) {
  const model = createBodyAerodynamics(parts, deployed);
  const rust = model.dragArea;
  const ts = referenceModel(parts, deployed).dragArea;
  let maxError = 0;
  const areas = directions.map((wind, i) => {
    const expected = ts(wind),
      actual = rust(wind);
    const error = Math.abs(actual - expected);
    maxError = Math.max(maxError, error);
    assert.ok(error <= 1e-9 + Math.abs(expected) * 1e-11, `${label} #${i}: ${actual} vs ${expected}`);
    return actual;
  });
  assert.equal(areas[0], areas[1]);
  assert.equal(areas[2], 0);
  if (!timed) {
    model.dispose();
    return areas;
  }
  const times = [[], []];
  const methods = [ts, rust];
  let checksum = 0;
  for (let round = 0; round < 7; round++) {
    for (let offset = 0; offset < 2; offset++) {
      const k = (round + offset) % 2;
      const start = performance.now();
      for (const wind of winds) checksum += methods[k](wind);
      if (round >= 2) times[k].push(performance.now() - start);
    }
  }
  assert.ok(checksum > 0);
  console.log(label, {maxError, medianMs: times.map(t => t.sort((a, b) => a - b)[2])});
  model.dispose();
  return areas;
}
const isolated = compare('asymmetric bounds', [part('tank')]);
assert.notEqual(isolated[0], isolated[3]);
compare('empty', []);
compare('disc and nose', [part('nose'), part('heatShield', [2, -1, 0])]);
compare('launcher', preset('launcher'), true, true);
compare('plane', preset('plane'), true, true);
const cargo = preset('transport-cargo');
const closed = compare('cargo closed', cargo, true, true);
const folded = compare('cargo folded', cargo, false);
assert.notDeepEqual(closed, folded);
for (const p of cargo) if (PARTS[p.type].cargoBay) p.cargoOpen = true;
const open = compare('cargo open', cargo, true, true);
assert.notDeepEqual(open, closed);
