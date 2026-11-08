// Build dist, then run the following from the repo root (artifacts/ must exist):
// rustc --edition 2024 --crate-type cdylib --target wasm32-unknown-unknown -C opt-level=3 tools/charge-kernel.rs -o artifacts/charge-kernel.wasm
// node tools/charge-kernel-profile.mjs
import assert from 'node:assert/strict';
import {makeKernel} from './charge-kernel-adapter.mjs';
import {PARTS, part, preset} from '../dist/catalog.js';
import {createCharge, distributeCharge} from '../dist/power.js';
import {chargeCases} from '../tests/fixtures/charge-cases.mjs';

for (const [initial, generation, demand, dt, target, consumption, ratio] of chargeCases) {
  const cells = initial.length ? [part('probe'), part('battery')] : [];
  const charge = new Map(cells.map((p, i) => [p.id, initial[i]])),
    ref = new Map(charge);
  const expected = distributeCharge([...cells, part('solar')], ref, generation, demand, dt);
  const result = makeKernel(cells)(charge, generation, demand, dt);
  assert.deepEqual(result, expected);
  assert.deepEqual(charge, ref);
  cells.forEach((p, i) => assert.ok(Math.abs(charge.get(p.id) - target[i]) < 1e-9));
  assert.ok(Math.abs(result.ratio - ratio) < 1e-9 && Math.abs(result.consumption - consumption) < 1e-9);
}
const steps = 20000;
for (const design of ['plane', 'transport-cargo']) {
  const parts = preset(design),
    cells = parts.filter(p => PARTS[p.type].battery);
  const kernels = [
    (charge, g, d, t) => distributeCharge(parts, charge, g, d, t),
    (charge, g, d, t) => distributeCharge(cells, charge, g, d, t),
    makeKernel(cells)
  ];
  const times = kernels.map(() => []);
  let reference;
  for (let trial = 0; trial < 9; trial++) {
    for (let slot = 0; slot < 3; slot++) {
      const k = (trial + slot) % 3,
        charge = createCharge(parts);
      const update = kernels[k];
      let checksum = 0;
      const start = performance.now();
      for (let i = 0; i < steps; i++) {
        const r = update(charge, (i % 7) * 0.2, (i % 5) * 0.4, 1 / 120);
        checksum += r.stored + r.net + r.consumption + r.ratio;
      }
      const elapsed = performance.now() - start;
      if (trial >= 3) times[k].push(elapsed);
      const end = {charge: [...charge], checksum};
      if (!reference) reference = end;
      else assert.deepEqual(end, reference);
    }
  }
  const median = values => {
    const sorted = [...values].sort((a, b) => a - b);
    return (sorted[2] + sorted[3]) / 2;
  };
  console.log(
    JSON.stringify({
      design,
      parts: parts.length,
      batteries: cells.length,
      steps,
      fullTS: median(times[0]),
      indexedTS: median(times[1]),
      wasm: median(times[2])
    })
  );
}
