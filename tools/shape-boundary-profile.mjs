// Run with --cache to compare radius reuse against the original per-pair scan.
// Without --cache, first build dist and compile the optional batch adapter (not shipped):
// npm exec --yes --package=wabt@1.0.37 -- wat2wasm tools/shape-boundary-profile.wat -o artifacts/shape-boundary-profile.wasm
import assert from 'node:assert/strict';
import {ShapeType} from '../dist/physics.js';
import {readFile} from 'node:fs/promises';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {WorldRuntime} from '../dist/world-runtime.js';

const cache = process.argv.includes('--cache');
const module = cache
  ? null
  : await WebAssembly.compile(
      await readFile(new URL('../artifacts/shape-boundary-profile.wasm', import.meta.url))
    );
function scalarRadius(v) {
  let r = 0;
  for (let i = 0; i < v.body.numColliders(); i++) {
    const c = v.body.collider(i),
      p = c.translationWrtParent(),
      h = c.shapeType() === ShapeType.Ball ? {x: c.radius(), y: c.radius(), z: c.radius()} : c.halfExtents();
    r = Math.max(r, Math.hypot(p.x, p.y, p.z) + Math.hypot(h.x, h.y, h.z));
  }
  return r;
}
const ticks = 480;
function measure(batch) {
  const root = new Flight(preset('orbiter'), 'orbit');
  try {
    const other = new Flight(preset('orbiter'), 'orbit');
    other.pos.x += 10000;
    root.detached.push(other);
    const runtime = new WorldRuntime(root);
    const vessels = [...runtime.vessels.values()];
    const refresh = [];
    let bytesPerTick = 0;
    for (const vessel of vessels) {
      const world = vessel.world,
        engine = world.exports;
      if (!cache || !batch) world.collisionRadius = () => scalarRadius(vessel);
      if (cache) continue;
      const count = vessel.body.numColliders();
      const {read, memory} = new WebAssembly.Instance(module, {engine}).exports;
      const values = new Float64Array(memory.buffer, 0, count * 7);
      bytesPerTick += values.byteLength;
      const reload = () => read(count);
      reload();
      for (let i = 0; i < values.length; i++)
        assert.equal(values[i], engine.shape_get(Math.floor(i / 7), i % 7));
      if (batch) {
        refresh.push(reload);
        world.exports = {
          ...engine,
          shape_get(index, field) {
            // Only fixed topology, far-separated vessels in this experiment.
            if (index < 0 || index >= count || field > 6) return engine.shape_get(index, field);
            return values[index * 7 + field];
          }
        };
      }
    }
    function step() {
      for (const read of refresh) read();
      runtime.step(1 / 120);
    }
    for (let i = 0; i < 120; i++) step();
    const start = performance.now();
    for (let i = 0; i < ticks; i++) step();
    const ms = performance.now() - start;
    assert.equal(runtime.vessels.size, 2);
    const end = vessels.map(v => {
      assert.ok(!v.crashed && v.universalTime === runtime.universalTime);
      return [
        v.universalTime,
        ...v.pos,
        ...v.vel,
        ...v.q,
        ...v.omega,
        ...v.fuel.values(),
        ...v.charge.values(),
        ...v.thermal.values()
      ];
    });
    return {ms, end, bytesPerTick};
  } finally {
    root.dispose();
  }
}
const scalarMs = [],
  batchMs = [],
  pairedSavingMs = [];
let bytesPerTick;
for (let i = 0; i < 10; i++) {
  const first = measure(i % 2 === 1),
    second = measure(i % 2 === 0);
  const [scalar, bulk] = i % 2 === 0 ? [first, second] : [second, first];
  assert.deepEqual(scalar.end, bulk.end);
  if (i < 2) continue;
  scalarMs.push(scalar.ms);
  batchMs.push(bulk.ms);
  pairedSavingMs.push(scalar.ms - bulk.ms);
  bytesPerTick = bulk.bytesPerTick;
}
console.log(
  JSON.stringify({
    candidate: cache ? 'cached' : 'batch',
    ticks,
    bytesPerTick,
    scalarMs,
    batchMs,
    pairedSavingMs
  })
);
