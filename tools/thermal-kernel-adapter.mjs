import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {PARTS} from '../dist/catalog.js';
import {partPointToVessel, partRotation} from '../dist/part-frame.js';
import {THERMAL} from '../dist/thermal.js';
const module = await WebAssembly.compile(
  await readFile(new URL('../artifacts/thermal-kernel.wasm', import.meta.url))
);
export function register(parts, definitions = PARTS) {
  const wasm = new WebAssembly.Instance(module).exports;
  const ptr = wasm.register(parts.length);
  const config = new Float64Array(wasm.memory.buffer, ptr, parts.length * 47);
  for (const [i, p] of parts.entries()) {
    const d = definitions[p.type],
      [x, y, z] = d.size,
      rotation = partRotation(p);
    const center = partPointToVessel(p, d.massCenter || [0, 0, 0]);
    const row = [];
    for (const a of [-1, 1])
      for (const b of [-1, 1])
        for (const c of [-1, 1])
          row.push(
            ...new T.Vector3((a * x) / 2, (b * y) / 2, (c * z) / 2)
              .applyQuaternion(rotation)
              .add(center)
              .toArray()
          );
    for (const axis of [
      [y * z, 0, 0],
      [0, x * z, 0],
      [0, 0, x * y]
    ])
      row.push(...new T.Vector3(...axis).applyQuaternion(rotation).toArray());
    const normal = new T.Vector3(...(d.shieldNormal || [0, -1, 0])).applyQuaternion(rotation);
    row.push(
      ...center
        .clone()
        .addScaledVector(normal, y / 2)
        .toArray(),
      ...normal.toArray(),
      d.heatShield ? d.shieldRadius || x / 2 : 0,
      2 * (x * y + y * z + z * x),
      Math.max(1, d.mass) * (d.heatCapacity || THERMAL.heatCapacity),
      d.emissivity || THERMAL.emissivity,
      d.noseRadius || Math.min(x, y, z) / 2,
      d.maxTemperature || THERMAL.maxTemperature,
      d.ablationTemperature || THERMAL.ablationTemperature,
      d.ablatorEnergy || THERMAL.ablatorEnergy
    );
    assert.equal(row.length, 47);
    config.set(row, i * 47);
  }
  const statePtr = wasm.states();
  const view = () => new Float64Array(wasm.memory.buffer, statePtr, parts.length * 8);
  return (state, q, v, air, dt) => {
    const input = view();
    for (const [i, p] of parts.entries()) {
      const s = state.get(p.id);
      input[i * 8] = s.temperature;
      input[i * 8 + 1] = s.ablator;
      input[i * 8 + 2] = Number(s.failed);
    }
    const speed = v.length(),
      dir = (speed ? v.clone().divideScalar(speed) : new T.Vector3(0, 1, 0)).applyQuaternion(
        q.clone().invert()
      );
    wasm.step(dir.x, dir.y, dir.z, speed, air.density, air.temperature, dt);
    const output = view(),
      readings = new Map();
    let hottest = null,
      consumed = 0;
    for (const [i, p] of parts.entries()) {
      const offset = i * 8,
        s = state.get(p.id);
      s.temperature = output[offset];
      s.ablator = output[offset + 1];
      s.failed = Boolean(output[offset + 2]);
      const limit = definitions[p.type].maxTemperature || THERMAL.maxTemperature;
      const r = {
        temperature: s.temperature,
        limit,
        failed: s.failed,
        shielded: Boolean(output[offset + 3]),
        flux: output[offset + 4],
        heat: output[offset + 5],
        loss: output[offset + 6],
        ablated: output[offset + 7]
      };
      readings.set(p.id, r);
      consumed += r.ablated;
      const ratio = s.temperature / limit;
      if (!hottest || ratio > hottest.ratio) hottest = {id: p.id, temperature: s.temperature, ratio};
    }
    return {
      parts: readings,
      hottest,
      consumed,
      failed: [...state].filter(([, s]) => s.failed).map(([id]) => id)
    };
  };
}
export function near(a, b) {
  assert.ok(Math.abs(a - b) <= 1e-8 + 1e-10 * Math.abs(a), a + ' vs ' + b);
}
export function compare(a, b) {
  assert.deepEqual([...a.parts.keys()], [...b.parts.keys()]);
  assert.deepEqual(a.failed, b.failed);
  assert.equal(a.hottest.id, b.hottest.id);
  near(a.hottest.ratio, b.hottest.ratio);
  near(a.consumed, b.consumed);
  for (const [id, row] of a.parts)
    for (const [key, value] of Object.entries(row)) {
      const other = b.parts.get(id)[key];
      if (typeof value === 'number') near(value, other);
      else assert.equal(value, other);
    }
}
