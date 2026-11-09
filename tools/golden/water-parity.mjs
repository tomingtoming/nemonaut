// rustc --edition 2024 --crate-type cdylib --target wasm32-unknown-unknown -O tools/water-kernel.rs -o artifacts/water-kernel.wasm
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Quaternion, Vector3} from 'three';
import {PARTS} from '../../dist/catalog.js';
import {partRotation} from '../../dist/aero.js';
import {displacedVolume} from '../../dist/buoyancy.js';
import {bodyAltitude, bodyGravity, bodyUp} from '../../dist/celestial.js';
import {surfaceRelativeVelocity, surfaceAngularVelocity, overWater} from '../../dist/surface-frame.js';
import {cases, observeFlight, reading} from './water-scenario.mjs';
import golden from '../../tests/golden/water-loads.json' with {type: 'json'};

const bytes = readFileSync(new URL('../../artifacts/water-kernel.wasm', import.meta.url));
const wasm = new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports;
const stride = 15;
function batch(f, samples, inverse, worldCOM) {
  const time = f.universalTime;
  f.updateColliderMasses();
  const mass = f.vesselStats().mass;
  const inertia = f.body.principalInertia(),
    frame = f.body.principalInertiaLocalFrame();
  const principal = f.q
    .clone()
    .multiply(new Quaternion(frame.x, frame.y, frame.z, frame.w))
    .invert();
  const flow = surfaceRelativeVelocity(worldCOM, f.vel, time);
  const omega = f.omega.clone().sub(surfaceAngularVelocity());
  const planing = samples.filter(s => PARTS[s.type].planingArea).length;
  const ptr = wasm.water_prepare(samples.length);
  const rows = new Float64Array(wasm.memory.buffer, ptr, stride * samples.length);
  const rotations = samples.map(({part, world}, i) => {
    assert.ok(overWater(world, time));
    const d = PARTS[part.type],
      q = f.q.clone().multiply(partRotation(part)),
      qi = q.clone().invert();
    const up = bodyUp(world, time).applyQuaternion(qi);
    const extent = (Math.abs(up.x) * d.size[0] + Math.abs(up.y) * d.size[1] + Math.abs(up.z) * d.size[2]) / 2;
    const lever = world.clone().sub(worldCOM);
    const velocity = omega.clone().cross(lever).add(flow).applyQuaternion(qi);
    const w = lever.cross(new Vector3(0, 0, -1).applyQuaternion(q)).applyQuaternion(principal);
    const turn = (v, k) => (k > 1e-9 ? (v * v) / k : 0);
    const inverseMass = 1 / mass + turn(w.x, inertia.x) + turn(w.y, inertia.y) + turn(w.z, inertia.z);
    rows.set(
      [
        bodyAltitude(world, time),
        extent,
        displacedVolume(part),
        bodyGravity(world, time).length(),
        ...velocity,
        ...up,
        ...(d.waterResistance ?? [1, 1, 1]),
        d.planingArea ?? 0,
        inverseMass
      ],
      i * stride
    );
    return q;
  });
  wasm.water_step(1 / 120, planing);
  samples.forEach((s, i) => {
    const j = i * stride;
    s.force.fromArray(rows, j + 1).add(new Vector3().fromArray(rows, j + 4));
    s.force.z -= rows[j + 7];
    s.force.applyQuaternion(rotations[i]).applyQuaternion(inverse);
  });
}

for (const [name, scenario] of Object.entries(cases)) {
  let maxPointError = 0;
  const actual = reading(scenario, (f, samples, inverse, worldCOM) => {
      batch(f, samples, inverse, worldCOM);
      const predicted = samples.map(s => s.force.clone());
      for (const s of samples) s.force.set(0, 0, 0);
      observeFlight(f, samples, inverse);
      samples.forEach((sample, i) => {
        const error = predicted[i].distanceTo(sample.force);
        maxPointError = Math.max(error, maxPointError);
        assert.ok(
          error <= 0.1 + sample.force.length() * 1e-5,
          `${name} ${sample.type} sample ${i}: ${error} N`
        );
        sample.force.copy(predicted[i]);
      });
    }),
    expected = golden[name];
  assert.equal(actual.wet, expected.wet);
  for (const key of ['fractions', 'buoyancy', 'buoyancyMoment', 'dynamic', 'dynamicMoment']) {
    expected[key].forEach((value, i) => {
      const tolerance = (key === 'fractions' ? 1e-6 : 0.1) + Math.abs(value) * 1e-5;
      assert.ok(
        Math.abs(actual[key][i] - value) <= tolerance,
        `${name} ${key}[${i}]: ${actual[key][i]} vs ${value}`
      );
    });
  }
  console.log(name, actual.wet, 'wet samples; max point error (N)', maxPointError);
}

// Hold partial immersion fixed and vary only the effective mass. The light body
// must lose at most its incoming speed across all four shared samples per step.
const ptr = wasm.water_prepare(2);
const rows = new Float64Array(wasm.memory.buffer, ptr, 2 * stride);
for (const [i, inverseMass] of [0.5, 0.00001].entries()) {
  rows.set([0, 1, 1, 9.8, 0, 0, 4, 0, 0, -1, 1, 1, 1, 2, inverseMass], i * stride);
}
wasm.water_step(1 / 120, 4);
assert.equal(rows[7], 240);
assert.equal(rows[stride + 7], 8000);
