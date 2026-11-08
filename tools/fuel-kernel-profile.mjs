import assert from 'node:assert/strict';
import {preset} from '../dist/catalog.js';
import {createFuel, engineBurn, fuelNetworks} from '../dist/resources.js';
import {referenceBurn} from './fuel-reference.mjs';
for (const design of ['launcher', 'transport-cargo']) {
  const parts = preset(design);
  const network = fuelNetworks(parts);
  const engines = network.groups.flatMap(g => g.engines);
  engines[0].thrustLimit = 0.25;
  const active = new Set(engines.map(e => e.id));
  const partial = new Set([engines[0].id]);
  const intake = p => (p.id === engines[0].id ? 0 : 0.8);
  const input = i => [
    i % 3 === 0 ? partial : active,
    (i % 5) / 4,
    (i % 4) * 0.408,
    1 / 120,
    (i % 7) * 20000,
    intake
  ];
  for (const factor of [0, 0.0001, 1]) {
    const a = createFuel(parts);
    let n = 0;
    for (const [id, kg] of a) a.set(id, kg * factor * (++n / 10));
    const c = new Map(a);
    for (let i = 0; i < 256; i++) {
      const args = input(i);
      const expected = referenceBurn(network, a, ...args);

      assert.deepEqual(engineBurn(network, c, ...args), expected);
      assert.deepEqual(c, a);
    }
  }
  const samples = [[], []],
    methods = [referenceBurn, engineBurn],
    steps = 10000;
  const args = input(7);
  for (let trial = 0; trial < 9; trial++) {
    let expected;
    for (const index of [trial % 2, (trial + 1) % 2]) {
      const fuel = createFuel(parts),
        update = methods[index];
      let sum = 0;
      const start = performance.now();
      for (let i = 0; i < steps; i++)
        for (const value of update(network, fuel, ...args).values()) sum += value;
      const elapsed = performance.now() - start;
      if (trial >= 3) samples[index].push(elapsed);
      if (!expected) expected = {fuel, sum};
      else assert.deepEqual({fuel, sum}, expected);
    }
  }
  const median = xs => {
    xs.sort((a, b) => a - b);
    return (xs[2] + xs[3]) / 2;
  };
  console.log({
    design,
    steps,
    tsMs: median(samples[0]),

    vesselMs: median(samples[1])
  });
}
