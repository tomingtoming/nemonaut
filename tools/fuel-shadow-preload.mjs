// Compare both solvers on actual calls, then let the Rust result drive the next tick.
import {registerHooks} from 'node:module';
import {threadId} from 'node:worker_threads';
import assert from 'node:assert/strict';
import {referenceBurn} from './fuel-reference.mjs';
const targets = new Set(
  ['resources.js', 'takeoff-forecast-worker.js'].map(f => new URL('../dist/' + f, import.meta.url).href)
);
let calls = 0;
globalThis.compareFuelBurn = (product, net, fuel, ...args) => {
  const copy = new Map(fuel);
  const intake = args[5],
    exposures = new Map();
  if (intake)
    args[5] = p => {
      const exposure = intake(p);
      exposures.set(p.id, exposure);
      return exposure;
    };
  const actual = product(net, fuel, ...args);
  if (intake)
    args[5] = p => {
      assert.ok(exposures.has(p.id));
      return exposures.get(p.id);
    };
  const expected = referenceBurn(net, copy, ...args);
  assert.deepEqual([...actual], [...expected]);
  assert.deepEqual(fuel, copy);
  if (++calls === 1) console.log('fuel parity active', threadId);
  return actual;
};
registerHooks({
  load(url, context, next) {
    const result = next(url, context);
    if (!targets.has(url)) return result;
    const code = Buffer.from(result.source).toString();
    const signature = /function engineBurn\(([^\n]+?)\) \{/g;
    assert.equal([...code.matchAll(signature)].length, 1);
    return {
      ...result,
      source: code.replace(
        signature,
        (_, params) =>
          'function engineBurn(...args){return globalThis.compareFuelBurn(productBurn,...args)}\nfunction productBurn(' +
          params +
          ') {'
      )
    };
  }
});
process.on('exit', () => {
  if (calls) console.log('matched fuel updates:', calls);
});
