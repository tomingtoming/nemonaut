// Node-only experiment. Build point-loads.rs first (SPRINTS.md, sprint 42).
// Preload before importing the game or its bundled prediction Worker.
import {readFileSync} from 'node:fs';
const module = new WebAssembly.Module(readFileSync(new URL('../../artifacts/point-loads.wasm', import.meta.url)));
const NativeInstance = WebAssembly.Instance;
let rows = 0;
let batches = 0;
let prepares = 0;
WebAssembly.Instance = new Proxy(NativeInstance, {
  construct(target, args) {
    const instance = new target(...args);
    const engine = instance.exports;
    if (!engine.body_add_force_at_point) return instance;
    let batch;
    let values;
    let count = 0;
    const exports = {...engine};
    function flush() {
      if (!count) return;
      if (batch.apply(count) !== 1) throw Error('Rapier rejected a queued point load');
      batches++;
      count = 0;
    }
    for (const [name, fn] of Object.entries(engine)) {
      if (typeof fn === 'function') exports[name] = (...args) => {
        flush();
        return fn(...args);
      };
    }
    exports.body_add_force_at_point = (...row) => {
      if (!row.every(Number.isFinite)) return 0;
      if (!batch) batch = new NativeInstance(module, {engine}).exports;
      if (!values || count * 6 === values.length) {
        const capacity = count ? count * 2 : 32;
        const pointer = batch.prepare(capacity);
        values = new Float64Array(batch.memory.buffer, pointer, capacity * 6);
        prepares++;
      }
      values.set(row, count++ * 6);
      rows++;
      return 1;
    };
    return {exports};
  }
});
export const counts = () => ({rows, batches, prepares});
