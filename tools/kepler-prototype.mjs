import {readFile} from 'node:fs/promises';
import {Vector3} from 'three';
const {instance} = await WebAssembly.instantiate(
  await readFile(new URL('../artifacts/kepler-kernel.wasm', import.meta.url))
);
const wasm = instance.exports;
const result = new Float64Array(wasm.memory.buffer);
export function rustDrift(p, v, mu, dt) {
  const address = wasm.drift(p.x, p.y, p.z, v.x, v.y, v.z, mu, dt);
  if (address < 0) throw Error('drift status ' + address);
  return {
    position: new Vector3().fromArray(result, address / 8),
    velocity: new Vector3().fromArray(result, address / 8 + 3)
  };
}
