// Optional differential preload for Node tests on the shared charge engine.
// Rewrites modules in memory only. Applied to the built power module and its bundled
// copy in the actual takeoff forecast worker. TS runs on a snapshot, Rust on live input.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {threadId} from 'node:worker_threads';

import {referenceCharge} from './charge-reference.mjs';

let calls = 0;
globalThis.compareChargeUpdate = (production, parts, charge, generation, demand, dt) => {
  try {
    const expectedCharge = new Map(charge);
    const expected = referenceCharge(parts, expectedCharge, generation, demand, dt);
    const actual = production(parts, charge, generation, demand, dt);
    assert.deepEqual(actual, expected);
    assert.deepEqual(charge, expectedCharge);
    if (++calls === 1) console.log('charge parity active, worker thread ' + threadId);
    return actual;
  } catch (error) {
    process.exitCode = 1;
    throw error;
  }
};
const targets = new Set(
  ['power.js', 'takeoff-forecast-worker.js'].map(f => new URL('../dist/' + f, import.meta.url).href)
);
registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (!targets.has(url)) return result;
    const code = Buffer.from(result.source).toString();
    const signature = 'function distributeCharge(parts, charge, generation, demand, dt) {';
    assert.equal(code.split(signature).length, 2, 'expected one allocation entry in ' + url);
    return {
      ...result,
      source: code.replace(
        signature,
        signature +
          '\n  return globalThis.compareChargeUpdate(productionCharge,parts,charge,generation,demand,dt);\n}\nfunction productionCharge(parts, charge, generation, demand, dt) {'
      )
    };
  }
});
process.on('exit', () => {
  if (calls) console.log('charge comparisons ' + calls + ' on thread ' + threadId);
});
