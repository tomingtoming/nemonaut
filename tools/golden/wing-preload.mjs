// Build tools/wing-kernel.rs as artifacts/wing-kernel.wasm before running Node tests with --import.
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import {Quaternion, Vector3} from 'three';
import {PARTS} from '../../dist/catalog.js';

const bytes = readFileSync(new URL('../../artifacts/wing-kernel.wasm', import.meta.url));
const wasm = new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports;
const aero = new URL('../../dist/aero.js', import.meta.url).href;

export function surfaceForce(p, orientation, velocity, density, deflection = 0) {
  const span = new Vector3(1, 0, 0);
  const hinge = new Quaternion().setFromAxisAngle(span, deflection);
  const normal = new Vector3(0, 0, 1).applyQuaternion(hinge).applyQuaternion(orientation);
  const forward = new Vector3(0, 1, 0).applyQuaternion(hinge).applyQuaternion(orientation);
  span.applyQuaternion(orientation);
  const area = PARTS[p.type].wing;
  const ptr = wasm.wing_force(...velocity, ...span, ...normal, ...forward, density, area);
  const [x, y, z, alpha, cl, stall] = new Float64Array(wasm.memory.buffer, ptr, 6);
  if (area === undefined && Number.isNaN(x)) throw Error('翼面積のない部品です');
  return {force: new Vector3(x, y, z), alpha, cl, stalled: Boolean(stall)};
}

registerHooks({
  load(url, context, next) {
    if (url !== aero) return next(url, context);
    return {
      format: 'module',
      shortCircuit: true,
      source: `export * from '${aero}?reference'; export {surfaceForce} from '${import.meta.url}';`
    };
  }
});
