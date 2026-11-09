// Run after building the standalone Wasm as described in SPRINTS.md, sprint 30.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Euler, Quaternion, Vector3} from 'three';
import {preset, PARTS} from '../../dist/catalog.js';
import {statistics} from '../../dist/core.js';
import {aeroPoint, controlDeflection, partRotation, surfaceForce} from '../../dist/aero.js';

const bytes = readFileSync(new URL('../../artifacts/wing-kernel.wasm', import.meta.url));
const wasm = new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports;
const methods = ['ts', 'single', 'batch'];
const stride = 14;

function compare(kind) {
  const parts = preset(kind),
    com = statistics(parts).com;
  const wings = parts.filter(p => PARTS[p.type].wing);
  const ptr = wasm.wing_prepare(wings.length);
  const rows = new Float64Array(wasm.memory.buffer, ptr, stride * wings.length);
  const samples = Array.from({length: 64}, (_, tick) => {
    const t = (tick * Math.PI) / 32;
    const pose = new Quaternion().setFromEuler(new Euler(0.2 * Math.sin(t), t, -0.3));
    const omega = new Vector3(0.04, -0.06, 0.1).applyQuaternion(pose);
    const flow = new Vector3(3, -5 - 32 * Math.sin(t), 80).applyQuaternion(pose);
    return wings.map(p => {
      const arm = aeroPoint(p).sub(com).applyQuaternion(pose);
      return {
        p,
        arm,
        velocity: omega.clone().cross(arm).add(flow),
        orientation: pose.clone().multiply(partRotation(p)),
        angle: controlDeflection(p, com, {pitch: Math.cos(t), roll: Math.sin(t), yaw: 0.3})
      };
    });
  });

  function step(method, sample, inspect) {
    const force = new Vector3(),
      torque = new Vector3(),
      moment = new Vector3();
    let stalls = 0;
    function apply(i, f, alpha, cl, stalled) {
      force.add(f);
      torque.add(moment.crossVectors(sample[i].arm, f));
      if (stalled) stalls++;
      if (inspect) inspect.push(f.x, f.y, f.z, alpha, cl, Number(stalled));
    }
    for (const [i, {p, velocity: v, orientation, angle}] of sample.entries()) {
      if (method === 'ts') {
        const r = surfaceForce(p, orientation, v, 1.1, angle);
        apply(i, r.force, r.alpha, r.cl, r.stalled);
        continue;
      }
      const s = new Vector3(1, 0, 0),
        hinge = new Quaternion().setFromAxisAngle(s, angle);
      const n = new Vector3(0, 0, 1).applyQuaternion(hinge).applyQuaternion(orientation);
      const f = new Vector3(0, 1, 0).applyQuaternion(hinge).applyQuaternion(orientation);
      s.applyQuaternion(orientation);
      const area = PARTS[p.type].wing;
      if (method === 'single') {
        const out = wasm.wing_force(v.x, v.y, v.z, s.x, s.y, s.z, n.x, n.y, n.z, f.x, f.y, f.z, 1.1, area);
        const r = new Float64Array(wasm.memory.buffer, out, 6);
        apply(i, new Vector3().fromArray(r), r[3], r[4], r[5]);
      } else {
        const j = i * stride;
        v.toArray(rows, j);
        s.toArray(rows, j + 3);
        n.toArray(rows, j + 6);
        f.toArray(rows, j + 9);
        rows[j + 12] = 1.1;
        rows[j + 13] = area;
      }
    }
    if (method === 'batch') {
      wasm.wing_batch();
      for (let i = 0; i < sample.length; i++) {
        const j = i * stride;
        apply(i, new Vector3().fromArray(rows, j), rows[j + 3], rows[j + 4], rows[j + 5]);
      }
    }
    return [...force, ...torque, stalls];
  }
  for (const sample of samples) {
    const expected = [];
    expected.push(...step('ts', sample, expected));
    for (const method of methods.slice(1)) {
      const actual = [];
      actual.push(...step(method, sample, actual));
      assert.equal(actual.length, expected.length);
      actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) <= 1e-8 + Math.abs(expected[i]) * 1e-10));
    }
  }
  const times = methods.map(() => []);
  let checksum = 0;
  for (let round = 0; round < 9; round++) {
    for (let k = 0; k < 3; k++) {
      const id = (round + k) % 3;
      const start = performance.now();
      for (let tick = 0; tick < 4096; tick++) checksum += step(methods[id], samples[tick % 64])[3];
      if (round >= 3) times[id].push(performance.now() - start);
    }
  }
  assert.ok(Number.isFinite(checksum));
  const median = times.map(ms => {
    ms.sort((a, b) => a - b);
    return Number(((ms[2] + ms[3]) / 2).toFixed(2));
  });
  console.log(
    kind,
    wings.length,
    'surfaces; 4096 steps (ms)',
    Object.fromEntries(methods.map((m, i) => [m, median[i]]))
  );
}

compare('plane');
compare('transport-cargo');
