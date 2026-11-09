import assert from 'node:assert/strict';
import test from 'node:test';
import {cases, reading} from '../tools/golden/water-scenario.mjs';
import golden from './golden/water-loads.json' with {type: 'json'};

for (const [name, scenario] of Object.entries(cases)) {
  test('water sample loads about the vessel COM: ' + name, () => {
    const actual = reading(scenario),
      expected = golden[name];
    assert.equal(actual.wet, expected.wet);
    for (const key of ['fractions', 'buoyancy', 'buoyancyMoment', 'dynamic', 'dynamicMoment']) {
      assert.equal(actual[key].length, expected[key].length);
      expected[key].forEach((v, i) => {
        const tolerance = (key === 'fractions' ? 1e-6 : 0.1) + Math.abs(v) * 1e-5;
        assert.ok(Math.abs(actual[key][i] - v) <= tolerance, `${key}[${i}]: ${actual[key][i]} vs ${v}`);
      });
    }
  });
}
