// From the repo root after npm run build:
// rustc --edition 2024 --crate-type cdylib --target wasm32-unknown-unknown -C opt-level=3 tools/coast-cooling-kernel.rs -o artifacts/coast-cooling-kernel.wasm
// node tools/coast-cooling-profile.mjs
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PARTS, preset} from '../dist/catalog.js';
import {atmosphere} from '../dist/planet.js';
import {coolStationary} from '../dist/coast-flight.js';
import {createThermal, THERMAL} from '../dist/thermal.js';
const {instance} = await WebAssembly.instantiate(
  await readFile(new URL('../artifacts/coast-cooling-kernel.wasm', import.meta.url))
);
const wasm = instance.exports;
function coolBatch(parts, states, dt, air) {
  if (!Number.isFinite(dt) || dt <= 0) throw Error('冷却時間が不正です');
  const ptr = wasm.prepare(parts.length);
  const buf = new Float64Array(wasm.memory.buffer, ptr, parts.length * 3);
  for (const [i, p] of parts.entries()) {
    const d = PARTS[p.type],
      [x, y, z] = d.size,
      temp = states.get(p.id)?.temperature;

    const area = 2 * (x * y + y * z + z * x),
      capacity = Math.max(1, d.mass) * (d.heatCapacity || THERMAL.heatCapacity);
    buf[3 * i] = temp;
    buf[3 * i + 1] = ((d.emissivity || THERMAL.emissivity) * THERMAL.sigma * area) / capacity;
    buf[3 * i + 2] = (air.density * 10 * area) / capacity;
  }
  const status = wasm.cool(dt, air.density > 1e-9 ? air.temperature : 3);
  const done = status < 0 ? -status - 1 : status;
  for (let i = 0; i < done; i++) states.get(parts[i].id).temperature = buf[3 * i];
  if (status < 0) throw Error('真空冷却の温度が不正です');
  if (done !== parts.length) throw Error('真空冷却の計算上限です');
}
const ground = atmosphere(0),
  vacuum = {density: 0, temperature: 3};
function initial(parts, temps) {
  const states = createThermal(parts);
  for (const [i, p] of parts.entries()) {
    const s = states.get(p.id);
    s.temperature = temps[i % temps.length];
    s.failed = i % 2 === 0;
    s.ablator = Math.min(s.ablator, 0.001);
  }
  return states;
}
function compare(states, ref, original) {
  for (const [id, s] of states) {
    const t = ref.get(id).temperature;
    assert.ok(Math.abs(s.temperature - t) < 1e-8, s.temperature + ' vs ' + t);
    assert.equal(s.ablator, original.get(id).ablator);
    assert.equal(s.failed, original.get(id).failed);
  }
}
const craft = preset('reentry');
let cases = 0;
for (const air of [vacuum, ground, {density: 1e-9, temperature: 220}, {density: 1.01e-9, temperature: 220}]) {
  const equilibrium = air.density > 1e-9 ? air.temperature : 3;
  for (const dt of [1 / 120, 5, 300, 3600]) {
    for (const temp of [3, Math.max(3, equilibrium - 0.001), equilibrium, equilibrium + 0.001, 650, 1400]) {
      const start = initial(craft, [temp]),
        a = structuredClone(start),
        b = structuredClone(start);
      coolStationary(craft, a, dt, air);
      coolBatch(craft, b, dt, air);
      compare(b, a, start);
      for (const s of b.values())
        assert.ok(
          s.temperature >= Math.min(temp, equilibrium) && s.temperature <= Math.max(temp, equilibrium)
        );
      cases++;
    }
  }
}
for (const run of [coolStationary, coolBatch]) {
  const s = initial(craft, [1000]),
    before = structuredClone(s);
  assert.throws(() => run(craft, s, 1e9, ground), /計算上限/);
  assert.deepEqual(s, before);
}
const badState = initial(craft, [1000]);
badState.delete(craft[1].id);
const reference = structuredClone(badState),
  batch = structuredClone(badState);
assert.throws(() => coolStationary(craft, reference, 5, ground), /温度が不正/);
assert.throws(() => coolBatch(craft, batch, 5, ground), /温度が不正/);
compare(batch, reference, badState);
assert.ok(batch.get(craft[0].id).temperature < 1000);
assert.equal(batch.get(craft[2].id).temperature, 1000);
console.log({cases});
for (const [name, air] of [
  ['reentry', vacuum],
  ['rover', ground],
  ['transport-cargo', ground]
]) {
  const parts = preset(name),
    base = initial(parts, [1000, 200, 288.15]),
    samples = [[], []];
  const steps = 1200;
  for (let trial = 0; trial < 9; trial++) {
    const maps = [structuredClone(base), structuredClone(base)];
    for (const k of [trial % 2, 1 - (trial % 2)]) {
      const run = k ? coolBatch : coolStationary,
        t = performance.now();
      for (let i = 0; i < steps; i++) run(parts, maps[k], 5, air);
      if (trial >= 2) samples[k].push(performance.now() - t);
    }
    compare(maps[1], maps[0], base);
  }
  console.log({name, parts: parts.length, steps, medianMs: samples.map(s => s.sort((a, b) => a - b)[3])});
}
