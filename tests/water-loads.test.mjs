import assert from 'node:assert/strict';
import test from 'node:test';
import {Vector3} from 'three';
import {Flight} from '../dist/core.js';
import {preset, PARTS} from '../dist/catalog.js';
import {bodyUp} from '../dist/celestial.js';
import {partCenter, partRotation} from '../dist/aero.js';
import {fleet} from '../dist/fleet.js';
import {cases, observeFlight, reading} from '../tools/golden/water-scenario.mjs';
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

test('submerged fracture moves water loads to the surviving parts of each vessel', () => {
  const f = new Flight(preset('sub'), 'water', 161700);
  try {
    f.pos.addScaledVector(bodyUp(f.pos, f.universalTime), -8);
    f.step(1 / 120);
    f.fractureParts([f.parts.find(p => p.type === 'ballast').id]);
    const vessels = fleet(f);
    assert.ok(vessels.length > 1);
    for (const vessel of vessels) {
      const samples = vessel.parts.flatMap(p =>
        [-0.32, 0.32].map(side => ({
          world: new Vector3(0, side * PARTS[p.type].size[1], 0)
            .applyQuaternion(partRotation(p))
            .add(partCenter(p))
            .applyQuaternion(vessel.q)
            .add(vessel.pos),
          force: new Vector3()
        }))
      );
      observeFlight(vessel, samples, vessel.q.clone().invert());
      assert.ok(samples.every(s => s.force.lengthSq() > 0));
    }
  } finally {
    f.dispose();
  }
});
