// Node-only experiment. Build point-loads.rs first (SPRINTS.md, sprint 42).
// Preload before importing the game or its bundled prediction Worker.
import {readFileSync} from 'node:fs';
const mode = process.env.POINT_LOAD_MODE ?? 'separate';
const integrated = mode === 'integrated';
const filename = integrated ? 'point-load-engine.wasm' : 'point-loads.wasm';
const module = new WebAssembly.Module(readFileSync(new URL(`../../artifacts/${filename}`, import.meta.url)));
const NativeInstance = WebAssembly.Instance;
let rows = 0;
let batches = 0;
let prepares = 0;
WebAssembly.Instance = new Proxy(NativeInstance, {
  construct(target, args) {
    const gameEngine =
      integrated && WebAssembly.Module.exports(args[0]).some(e => e.name === 'body_add_force_at_point');
    const instance = gameEngine ? new target(module, args[1]) : new target(...args);
    const engine = instance.exports;
    if (!engine.body_add_force_at_point) return instance;
    let batch;
    let values;
    let count = 0,
      capacity = 0,
      pointer = 0;
    const exports = {...engine};
    function flush() {
      if (!count) return;
      if ((integrated ? engine.point_load_apply(pointer, count) : batch.apply(count)) !== 1)
        throw Error('Rapier rejected a queued point load');
      batches++;
      count = 0;
    }
    for (const [name, fn] of Object.entries(engine)) {
      if (typeof fn === 'function')
        exports[name] = (...args) => {
          flush();
          if (integrated && name === 'water_prepare') capacity = 0;
          return fn(...args);
        };
    }
    function reserve() {
      if (!batch) batch = integrated ? engine : new NativeInstance(module, {engine}).exports;
      if (count === capacity) {
        capacity = count ? count * 2 : 32;
        pointer = integrated ? engine.water_prepare(Math.ceil((capacity * 6) / 15)) : batch.prepare(capacity);
        values = null;
        prepares++;
      }
      if (values?.buffer !== batch.memory.buffer)
        values = new Float64Array(batch.memory.buffer, pointer, capacity * 6);
    }
    exports.body_add_force_at_point =
      mode === 'separate'
        ? (...row) => {
            if (!row.every(Number.isFinite)) return 0;
            reserve();
            values.set(row, count++ * 6);
            rows++;
            return 1;
          }
        : (fx, fy, fz, px, py, pz) => {
            if (
              !Number.isFinite(fx) ||
              !Number.isFinite(fy) ||
              !Number.isFinite(fz) ||
              !Number.isFinite(px) ||
              !Number.isFinite(py) ||
              !Number.isFinite(pz)
            )
              return 0;
            reserve();
            const i = count++ * 6;
            values[i] = fx;
            values[i + 1] = fy;
            values[i + 2] = fz;
            values[i + 3] = px;
            values[i + 4] = py;
            values[i + 5] = pz;
            rows++;
            return 1;
          };
    return {exports};
  }
});
export const counts = () => ({rows, batches, prepares});
