// Build dist, then run from the repository root:
// rustc --edition 2024 --crate-type cdylib --target wasm32-unknown-unknown -C opt-level=3 tools/thermal-kernel.rs -o artifacts/thermal-kernel.wasm
// node tools/thermal-kernel-profile.mjs
import assert from 'node:assert/strict';
import * as T from 'three';
import {PARTS, preset} from '../dist/catalog.js';
import {createThermal} from '../dist/thermal.js';
import {thermalStep} from './golden/thermal-reference.mjs';
import {register, compare, near} from './thermal-kernel-adapter.mjs';
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
