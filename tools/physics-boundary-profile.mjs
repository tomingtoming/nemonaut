// Run after building dist: node tools/physics-boundary-profile.mjs
// Counts only the per-vessel World exports during world updates, excluding setup and disposal.
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {loadPhysics} from '../dist/physics.js';

import {WorldRuntime} from '../dist/world-runtime.js';
import {PhysicsClock} from '../dist/physics-clock.js';

await loadPhysics();
function countExports(world, counts) {
  world.exports = Object.fromEntries(
    Object.entries(world.exports).map(([name, fn]) => [
      name,
      typeof fn !== 'function'
        ? fn
        : (...args) => {
            counts.calls[name] = (counts.calls[name] ?? 0) + 1;
            counts.scalarArguments += args.length;
            return fn(...args);
          }
    ])
  );
}
const dt = 1 / 120;
const ticks = 120;
function sample(design, instrument) {
  const flight = new Flight(preset(design), 'runway', 161700);
  const world = flight.world;
  const original = world.exports;
  const counts = {calls: {}, scalarArguments: 0};
  try {
    flight.stageNext();
    flight.throttle = 0.35;
    for (let i = 0; i < 30; i++) flight.step(dt);
    if (instrument) {
      countExports(world, counts);
    }
    const start = performance.now();
    for (let i = 0; i < ticks; i++) flight.step(dt);
    const elapsedMs = performance.now() - start;
    assert.equal(flight.crashed, false);
    assert.equal(flight.detached.length, 0);
    return {
      parts: flight.parts.length,
      elapsedMs,
      ...counts,
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

function orbitalFleet(size, rate, instrument) {
  const root = new Flight(preset('orbiter'), 'orbit');
  const frames = 60;
  try {
    if (size === 2) {
      const other = new Flight(preset('orbiter'), 'orbit');
      other.pos.x += 10000;
      root.detached.push(other);
    }
    const runtime = new WorldRuntime(root);
    const clock = new PhysicsClock();
    const vessels = [...runtime.vessels.values()];
    const stats = vessels.map(() => ({calls: {}, scalarArguments: 0}));
    if (instrument) vessels.forEach((v, i) => countExports(v.world, stats[i]));
    let steps = 0;
    const start = performance.now();
    for (let i = 0; i < frames; i++) {
      if (rate === 1000) {
        const result = runtime.coast(rate / 60, {maxSteps: 64});
        assert.equal(result.reason, null);
        assert.ok(result.remaining < 1e-8);
        steps += result.steps;
      } else {
        const result = clock.advance(1 / 60, rate, step => runtime.step(step));
        assert.equal(result.limited, false);
        steps += result.steps;
      }
    }
    const elapsedMs = performance.now() - start;
    const updateCounts = structuredClone(stats);
    assert.equal(runtime.vessels.size, size);
    assert.ok(Math.abs(runtime.universalTime - rate) < 1e-7);
    const end = vessels.map(v => {
      assert.equal(v.universalTime, runtime.universalTime);
      assert.equal(v.crashed, false);
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
    return {steps, elapsedMs, stats: updateCounts, end};
  } finally {
    root.dispose();
  }
}

for (const size of [1, 2]) {
  for (const rate of [1, 4, 1000]) {
    const plain = orbitalFleet(size, rate, false);
    const counted = orbitalFleet(size, rate, true);
    assert.deepEqual(counted.end, plain.end);
    for (const {calls} of counted.stats) assert.equal(calls.world_step ?? 0, rate === 1000 ? 0 : rate * 120);
    console.log(
      JSON.stringify({
        design: 'orbiter',
        size,
        rate,
        frames: 60,
        steps: counted.steps,
        uninstrumentedMs: plain.elapsedMs,
        shapeReadsPerVessel: counted.stats.map(s => s.calls.shape_get ?? 0),
        callsPerVessel: counted.stats.map(s => Object.values(s.calls).reduce((a, b) => a + b, 0)),
        scalarArgumentsPerVessel: counted.stats.map(s => s.scalarArguments)
      })
    );
  }
}
