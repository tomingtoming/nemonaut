// Build dist, then run from the repository root:
// rustc --edition 2024 --crate-type cdylib --target wasm32-unknown-unknown -C opt-level=3 tools/thermal-kernel.rs -o artifacts/thermal-kernel.wasm
// node tools/thermal-kernel-profile.mjs
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {PARTS, preset} from '../dist/catalog.js';
import {partPointToVessel, partRotation} from '../dist/part-frame.js';
import {createThermal, thermalStep, THERMAL} from '../dist/thermal.js';
const module = await WebAssembly.compile(
  await readFile(new URL('../artifacts/thermal-kernel.wasm', import.meta.url))
);
function register(parts) {
  const wasm = new WebAssembly.Instance(module).exports;
  const ptr = wasm.register(parts.length);
  const config = new Float64Array(wasm.memory.buffer, ptr, parts.length * 47);
  for (const [i, p] of parts.entries()) {
    const d = PARTS[p.type],
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
      const limit = PARTS[p.type].maxTemperature || THERMAL.maxTemperature;
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
function near(a, b) {
  assert.ok(Math.abs(a - b) <= 1e-8 + 1e-10 * Math.abs(a), a + ' vs ' + b);
}
function compare(a, b) {
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
for (const name of ['reentry', 'returner', 'transport-cargo']) {
  const parts = preset(name),
    q = new T.Quaternion(),
    air = {density: 0.025, temperature: 220};
  const v = name === 'transport-cargo' ? new T.Vector3(0, 0, 90) : new T.Vector3(0, -2300, 0);
  if (name === 'transport-cargo') air.density = 1.225;
  const begin = performance.now(),
    update = register(parts),
    setup = performance.now() - begin;
  const ts = createThermal(parts);
  const shield = parts.find(p => PARTS[p.type].heatShield);
  if (shield) Object.assign(ts.get(shield.id), {temperature: 650, ablator: 0.001});
  const rust = structuredClone(ts);
  function check(list, run, velocity, dt) {
    const result = run(rust, q, velocity, air, dt);
    compare(thermalStep(list, ts, q, velocity, air, dt), result);
    for (const p of list) near(ts.get(p.id).ablator, rust.get(p.id).ablator);
    return result;
  }
  for (let tick = 0; tick < 120; tick++) {
    if (shield && tick === 60) for (const s of [ts, rust]) s.get(shield.id).temperature = 1900;
    if (tick === 30) q.setFromAxisAngle(new T.Vector3(1, 0, 0), 0.2);
    if (tick === 50) q.identity();
    const result = check(parts, update, v, 1 / 120);
    if (name === 'reentry' && (tick === 60 || tick === 61)) {
      assert.ok(result.failed.includes(shield.id));
      assert.equal(result.parts.get(parts.find(p => p.type === 'capsule').id).shielded, tick === 60);
    }
  }
  q.setFromAxisAngle(new T.Vector3(1, 0, 0), 0.8);
  check(parts, update, v, 0.2);
  check(parts, update, new T.Vector3(), 0.05);
  // Re-register the retained side of a separator, then a reordered, remounted assembly.
  const separator = parts.find(p => PARTS[p.type].decoupler);
  if (separator) {
    const removed = new Set([separator.id]);
    for (let n = 0; n < parts.length; n++)
      for (const p of parts) if (removed.has(p.parent)) removed.add(p.id);
    const retained = parts.filter(p => !removed.has(p.id));
    assert.ok(retained.length && retained.length < parts.length);
    check(retained, register(retained), v, 1 / 120);
  }
  const rebuilt = structuredClone(parts).reverse();
  rebuilt[0].r[1] += 0.35;
  check(rebuilt, register(rebuilt), v, 1 / 120);
  const times = [[], []];
  q.identity();
  for (let trial = 0; trial < 9; trial++)
    for (const k of [trial % 2, 1 - (trial % 2)]) {
      const s = createThermal(parts);
      if (shield) Object.assign(s.get(shield.id), {temperature: 650, ablator: 0.001});
      const start = performance.now();
      for (let i = 0; i < 1200; i++) {
        if (k) update(s, q, v, air, 1 / 120);
        else thermalStep(parts, s, q, v, air, 1 / 120);
      }
      if (trial >= 2) times[k].push(performance.now() - start);
    }
  console.log(name, {setupMs: setup, medianMs: times.map(x => x.sort((a, b) => a - b)[3])});
}
