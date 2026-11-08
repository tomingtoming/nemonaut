import {readFile} from 'node:fs/promises';
import {PARTS} from '../dist/catalog.js';

const {instance} = await WebAssembly.instantiate(
  await readFile(new URL('../artifacts/fuel-kernel.wasm', import.meta.url))
);
const wasm = instance.exports;
export function vesselBurn(
  network,
  fuel,
  active,
  throttle,
  density,
  dt,
  pressure = (density / 1.225) * 101325,
  intake
) {
  const groups = [];
  let length = 0;
  for (const {engines, tanks} of network.groups) {
    const lit = engines.filter(p => active.has(p.id));
    if (!lit.length) continue;
    groups.push({lit, tanks, start: length});
    length += 2 + lit.length * 5 + tanks.length;
  }
  const thrust = new Map();
  if (!length) return thrust;
  const ptr = wasm.prepare(length);
  const buf = new Float64Array(wasm.memory.buffer, ptr, length);
  for (const {lit, tanks, start} of groups) {
    let i = start;
    buf[i++] = lit.length;
    buf[i++] = tanks.length;
    for (const p of lit) {
      const d = PARTS[p.type],
        air = d.oxidizerSource === 'atmosphere';
      buf[i++] = (d.thrust || 0) * (p.thrustLimit ?? 1);
      buf[i++] = d.isp;
      buf[i++] = d.ispSeaLevel ?? d.isp;
      buf[i++] = Number(air);
      buf[i++] = air ? (intake?.(p) ?? 1) : 1;
    }
    for (const tank of tanks) buf[i++] = fuel.get(tank.id) || 0;
  }
  wasm.burn_vessel(throttle, density, pressure, dt);
  for (const {lit, tanks, start} of groups) {
    let i = start + 2;
    for (const p of lit) {
      thrust.set(p.id, buf[i]);
      i += 5;
    }
    if (buf[start]) for (const p of tanks) fuel.set(p.id, buf[i++]);
  }
  return thrust;
}
