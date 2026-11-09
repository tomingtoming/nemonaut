// After npm run build, compile the standalone prototype from the repository root:
// rustc --edition 2024 --crate-type cdylib --target wasm32-unknown-unknown -C opt-level=3 tools/kepler-kernel.rs -o artifacts/kepler-kernel.wasm
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Vector3} from 'three';
import {PRIMARY, MOON} from '../dist/celestial.js';
import {keplerDrift} from '../dist/coast-orbit.js';
const {instance} = await WebAssembly.instantiate(
  await readFile(new URL('../artifacts/kepler-kernel.wasm', import.meta.url))
);
const wasm = instance.exports;
const result = new Float64Array(wasm.memory.buffer);
function rust(p, v, mu, dt) {
  const address = wasm.drift(p.x, p.y, p.z, v.x, v.y, v.z, mu, dt);
  if (address < 0) throw Error('drift status ' + address);
  return {
    position: new Vector3().fromArray(result, address / 8),
    velocity: new Vector3().fromArray(result, address / 8 + 3)
  };
}
let maxPosition = 0,
  maxVelocity = 0,
  cases = 0;
function compare(a, b) {
  const p = a.position.distanceTo(b.position),
    v = a.velocity.distanceTo(b.velocity);
  assert.ok(p < 0.001 && v < 0.00001, JSON.stringify({p, v}));
  maxPosition = Math.max(maxPosition, p);
  maxVelocity = Math.max(maxVelocity, v);
}
for (const body of [PRIMARY, MOON]) {
  const radius = body.radius + 80000;
  const p = new Vector3(0.6, 0, 0.8).multiplyScalar(radius);
  const speed = Math.sqrt(body.mu / radius);
  const quarter = rust(p, new Vector3(0, speed, 0), body.mu, (Math.PI * radius) / (2 * speed));
  assert.ok(quarter.position.distanceTo(new Vector3(0, radius, 0)) < 0.001);
  assert.ok(quarter.velocity.distanceTo(p.clone().multiplyScalar(-speed / radius)) < 0.00001);
  for (const factor of [0.85, 1, Math.SQRT2 * (1 - 1e-9), Math.SQRT2, Math.SQRT2 * (1 + 1e-9), 1.7]) {
    for (const radial of [0, 0.2]) {
      const v = new Vector3(0.6 * radial, Math.sqrt(1 - radial ** 2), 0.8 * radial).multiplyScalar(
        Math.sqrt(body.mu / radius) * factor
      );
      for (const dt of [-28800, -120, -5, 0, 1 / 120, 5, 120, 28800]) {
        compare(keplerDrift(p, v, body.mu, dt), rust(p, v, body.mu, dt));
        cases++;
      }
    }
  }
}
assert.throws(() => rust(new Vector3(), new Vector3(), 1, 1), /status -1/);
for (const dt of [5, 28800]) {
  const p = new Vector3(680000, 0, 0),
    v = new Vector3(0, Math.sqrt(PRIMARY.mu / 680000), 0);
  const samples = [[], []];
  for (let trial = 0; trial < 11; trial++) {
    const ends = [];
    for (const index of [trial % 2, 1 - (trial % 2)]) {
      const run = [keplerDrift, rust][index];
      let state = {position: p, velocity: v};
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        // The preview samples future epochs from the same initial state. Warp advances the state.
        state =
          dt === 5 ? run(state.position, state.velocity, PRIMARY.mu, dt) : run(p, v, PRIMARY.mu, dt + i);
      }
      const elapsed = performance.now() - start;
      if (trial >= 4) samples[index].push(elapsed);
      ends[index] = state;
    }
    compare(...ends);
  }
  console.log({dt, msPer1000: samples.map(times => times.sort((a, b) => a - b)[3])});
}
console.log({cases, maxPosition, maxVelocity});
