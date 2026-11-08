// Compare both solvers on actual calls, then let the Rust result drive the next tick.
import {registerHooks} from 'node:module';
import assert from 'node:assert/strict';
import {vesselBurn} from './fuel-vessel-kernel.mjs';
const target = new URL('../dist/resources.js', import.meta.url).href;
let calls = 0;
globalThis.compareFuelBurn = (reference, net, fuel, ...args) => {
  const copy = new Map(fuel);
  const expected = reference(net, copy, ...args);
  const actual = vesselBurn(net, fuel, ...args);
  assert.deepEqual([...actual], [...expected]);
  assert.deepEqual(fuel, copy);
  calls++;
  return actual;
};
registerHooks({
  load(url, context, next) {
    const result = next(url, context);
    if (url !== target) return result;
    const code = Buffer.from(result.source).toString();
    const signature = /function engineBurn\(([^\n]+?)\) \{/g;
    assert.equal([...code.matchAll(signature)].length, 1);
    return {
      ...result,
      source: code.replace(
        signature,
        (_, params) =>
          'function engineBurn(...args){return globalThis.compareFuelBurn(referenceBurn,...args)}\nfunction referenceBurn(' +
          params +
          ') {'
      )
    };
  }
});
process.on('exit', () => {
  if (calls) console.log('matched fuel updates:', calls);
});
