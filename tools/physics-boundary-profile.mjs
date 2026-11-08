// Run after building dist: node tools/physics-boundary-profile.mjs
// Counts only the per-vessel World exports during fixed ticks, excluding setup and disposal.
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {loadPhysics} from '../dist/physics.js';

await loadPhysics();
const dt = 1 / 120;
const ticks = 120;
function sample(design, instrument) {
  const flight = new Flight(preset(design), 'runway', 161700);
  const world = flight.world;
  const original = world.exports;
  const calls = {};
  let scalarArguments = 0;
  try {
    flight.stageNext();
    flight.throttle = 0.35;
    for (let i = 0; i < 30; i++) flight.step(dt);
    if (instrument) {
      world.exports = Object.fromEntries(
        Object.entries(original).map(([name, fn]) => [
          name,
          typeof fn !== 'function'
            ? fn
            : (...args) => {
                calls[name] = (calls[name] ?? 0) + 1;
                scalarArguments += args.length;
                return fn(...args);
              }
        ])
      );
    }
    const start = performance.now();
    for (let i = 0; i < ticks; i++) flight.step(dt);
    const elapsedMs = performance.now() - start;
    assert.equal(flight.crashed, false);
    assert.equal(flight.detached.length, 0);
    return {
      parts: flight.parts.length,
      elapsedMs,
      calls,
      scalarArguments,
      linearMemoryBytes: original.memory.buffer.byteLength,
      end: [
        flight.universalTime,
        ...flight.pos,
        ...flight.vel,
        ...flight.q,
        ...flight.omega,
        ...flight.fuel.values()
      ]
    };
  } finally {
    world.exports = original;
    flight.dispose();
  }
}

for (const design of ['plane', 'transport-cargo']) {
  const plain = sample(design, false);
  const measured = sample(design, true);
  assert.deepEqual(measured.end, plain.end);
  assert.equal(measured.calls.world_step, ticks);
  console.log(
    JSON.stringify({
      design,
      parts: measured.parts,
      ticks,
      uninstrumentedMs: plain.elapsedMs,
      calls: measured.calls,
      totalCalls: Object.values(measured.calls).reduce((a, b) => a + b, 0),
      scalarArguments: measured.scalarArguments,
      linearMemoryBytes: measured.linearMemoryBytes
    })
  );
}
