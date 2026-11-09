// Run after npm run build. Only the query-tagged copy is instrumented in memory.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import * as T from 'three';
import {preset} from '../dist/catalog.js';
import {createThermal} from '../dist/thermal.js';
import {thermalStep} from './golden/thermal-reference.mjs';

const target = new URL('./golden/thermal-reference.mjs?timed', import.meta.url).href;
function insert(source, anchor, replacement) {
  assert.equal(source.split(anchor).length, 2, 'expected a unique thermal timing boundary: ' + anchor);
  return source.replace(anchor, replacement);
}
const hook = registerHooks({
  load(url, ctx, next) {
    const result = next(url, ctx);
    if (url !== target) return result;
    let code = Buffer.from(result.source).toString();
    const coverage = 'shielded = shields.some(s => shieldCoverage(p, s, direction, q, definitions))';
    code = insert(
      code,
      coverage,
      'beginCoverage = performance.now(), ' +
        coverage +
        ', afterCoverage = coverageMs += performance.now()-beginCoverage'
    );
    code = insert(
      code,
      'for (let i = 0; i < count; i++)',
      'const beginIntegration=performance.now(); for (let i = 0; i < count; i++)'
    );
    code = insert(
      code,
      'consumed += ablated;',
      'integrationMs+=performance.now()-beginIntegration; consumed += ablated;'
    );
    return {
      ...result,
      source:
        code +
        '\nexport let coverageMs=0,integrationMs=0; export function reset(){coverageMs=0; integrationMs=0;}'
    };
  }
});
const timed = await import(target);
hook.deregister();
const median = values => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
const steps = 1200;
const q = new T.Quaternion();
for (const [design, speed, density] of [
  ['reentry', 2300, 0.025],
  ['returner', 2300, 0.025],
  ['transport-cargo', 90, 1.225]
]) {
  const parts = preset(design),
    velocity = new T.Vector3(0, -speed, 0),
    air = {density, temperature: 220};
  if (design === 'transport-cargo') velocity.set(0, 0, speed);
  const samples = {whole: [], coverage: [], integration: [], clock: []};
  for (let trial = 0; trial < 9; trial++) {
    let reference;
    for (const measuring of [trial % 2 === 0, trial % 2 !== 0]) {
      const state = createThermal(parts);
      for (const s of state.values())
        if (s.ablator) {
          s.ablator = 0.001;
          s.temperature = 650;
        }
      const update = measuring ? timed.thermalStep : thermalStep;
      timed.reset();
      let result;
      const start = performance.now();
      for (let i = 0; i < steps; i++) result = update(parts, state, q, velocity, air, 1 / 120);
      const elapsed = performance.now() - start;
      if (trial >= 2) {
        if (measuring) {
          samples.coverage.push(timed.coverageMs);
          samples.integration.push(timed.integrationMs);
        } else samples.whole.push(elapsed);
      }
      if (reference) assert.deepEqual({state, result}, reference);
      else reference = {state, result};
    }
    let clock = 0;
    for (let i = 0; i < steps * parts.length; i++) {
      const a = performance.now();
      clock += performance.now() - a;
    }
    if (trial >= 2) samples.clock.push(clock);
  }
  console.log(
    design,
    parts.length,
    steps,
    Object.fromEntries(Object.entries(samples).map(([k, x]) => [k, Number(median(x).toFixed(2))]))
  );
}
