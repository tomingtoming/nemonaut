import {readFile} from 'node:fs/promises';
import {PARTS} from '../dist/catalog.js';
const wasm = await WebAssembly.compile(
  await readFile(new URL('../artifacts/charge-kernel.wasm', import.meta.url))
);
export const newChargeEngine = () => new WebAssembly.Instance(wasm).exports;
export function makeKernel(batteries, engine = newChargeEngine()) {
  const ptr = engine.prepare(batteries.length);
  let buf = new Float64Array(engine.memory.buffer, ptr, 5 + 2 * batteries.length);
  batteries.forEach((p, i) => (buf[5 + i * 2] = PARTS[p.type].battery));
  return (charge, generation, demand, dt) => {
    if (buf.buffer !== engine.memory.buffer)
      buf = new Float64Array(engine.memory.buffer, ptr, 5 + 2 * batteries.length);
    for (let i = 0; i < batteries.length; i++) buf[6 + 2 * i] = charge.get(batteries[i].id) || 0;
    engine.distribute(generation, demand, dt);
    for (let i = 0; i < batteries.length; i++) charge.set(batteries[i].id, buf[6 + 2 * i]);
    return {
      stored: buf[0],
      capacity: buf[1],
      generation,
      demand,
      consumption: buf[2],
      ratio: buf[3],
      net: buf[4]
    };
  };
}
