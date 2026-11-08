// Build dist first, then compile from the repository root:
// rustc --edition 2024 --crate-type cdylib --target wasm32-unknown-unknown -C opt-level=3 tools/fuel-kernel.rs -o artifacts/fuel-kernel.wasm
// node tools/fuel-kernel-profile.mjs
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PARTS, preset} from '../dist/catalog.js';
import {createFuel, engineBurn, engineMaxThrust, fuelNetworks} from '../dist/resources.js';

const {instance} = await WebAssembly.instantiate(
  await readFile(new URL('../artifacts/fuel-kernel.wasm', import.meta.url))
);
const wasm = instance.exports;
function wasmBurn(network, fuel, active, throttle, density, dt, pressure, intake) {
  const thrust = new Map();
  for (const group of network.groups) {
    const engines = group.engines.filter(p => active.has(p.id));
    if (!engines.length) continue;
    const tankOffset = engines.length * 5;
    const length = tankOffset + group.tanks.length;
    const ptr = wasm.prepare(length);
    const buf = new Float64Array(wasm.memory.buffer, ptr, length);
    for (const [i, p] of engines.entries()) {
      const def = PARTS[p.type],
        air = def.oxidizerSource === 'atmosphere';
      const offset = 5 * i;
      buf[offset] = engineMaxThrust(p);
      buf[offset + 1] = def.isp;
      buf[offset + 2] = def.ispSeaLevel ?? def.isp;
      buf[offset + 3] = Number(air);
      buf[offset + 4] = air ? intake(p) : 1;
    }
    for (const [i, p] of group.tanks.entries()) buf[tankOffset + i] = fuel.get(p.id) || 0;
    const changed = wasm.burn(engines.length, throttle, density, pressure, dt);
    for (const [i, p] of engines.entries()) thrust.set(p.id, buf[5 * i]);
    if (changed) for (const [i, p] of group.tanks.entries()) fuel.set(p.id, buf[tankOffset + i]);
  }
  return thrust;
}

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
    const b = new Map(a);
    for (let i = 0; i < 256; i++) {
      const args = input(i);
      assert.deepEqual(wasmBurn(network, b, ...args), engineBurn(network, a, ...args));
      assert.deepEqual(b, a);
    }
  }
  const samples = [[], []],
    methods = [engineBurn, wasmBurn],
    steps = 10000;
  const args = input(7);
  for (let trial = 0; trial < 9; trial++) {
    let expected;
    for (const index of [trial % 2, 1 - (trial % 2)]) {
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
  console.log({design, steps, tsMs: median(samples[0]), wasmMs: median(samples[1])});
}
