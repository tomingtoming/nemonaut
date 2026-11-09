// Differential replay of the shipping flight entry point, including the bundled forecast Worker.
import {registerHooks} from 'node:module';
import {threadId} from 'node:worker_threads';
import assert from 'node:assert/strict';
import {thermalStep} from './golden/thermal-reference.mjs';
import {compare, near} from './thermal-kernel-adapter.mjs';
const targets = new Set(
  ['flight-thermal.js', 'takeoff-forecast-worker.js'].map(p => new URL('../dist/' + p, import.meta.url).href)
);
const totals = {updates: 0, registrations: 0};
globalThis.countThermalRegistration = () => totals.registrations++;
globalThis.compareThermal = (product, world, parts, state, q, v, air, dt) => {
  const copy = new Map([...state].map(([id, s]) => [id, {...s}]));
  const expected = thermalStep(parts, copy, q, v, air, dt);
  const actual = product(world, parts, state, q, v, air, dt);
  compare(expected, actual);
  for (const [id, s] of state) near(s.ablator, copy.get(id).ablator);
  if (++totals.updates === 1) console.log('thermal comparison active, thread', threadId);
  return actual;
};
registerHooks({
  load(url, ctx, next) {
    const result = next(url, ctx);
    if (!targets.has(url)) return result;
    const source = Buffer.from(result.source).toString();
    const signature = 'function flightThermalStep(world, parts, state, q, v, air, dt) {';
    const register = 'wasm.thermal_register(parts.length)';
    assert.equal(source.split(signature).length, 2);
    assert.equal(source.split(register).length, 2);
    return {
      ...result,
      source: source
        .replace(register, '(globalThis.countThermalRegistration(),' + register + ')')
        .replace(
          signature,
          signature +
            'return globalThis.compareThermal(productThermal,world,parts,state,q,v,air,dt);}\nfunction productThermal(world,parts,state,q,v,air,dt){'
        )
    };
  }
});
export const thermalCounts = () => ({...totals});
process.on('exit', () => {
  if (totals.updates) console.log('thermal replay', totals);
});
