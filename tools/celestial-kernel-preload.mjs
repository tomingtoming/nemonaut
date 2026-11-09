// Compile from the repository root after npm run build:
// rustc --edition 2024 --crate-type cdylib --target wasm32-unknown-unknown -C opt-level=3 tools/celestial-kernel.rs -o artifacts/celestial-kernel.wasm
// node --import ./tools/celestial-kernel-preload.mjs --test tests/celestial-integration.test.mjs
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import assert from 'node:assert/strict';
const url = new URL('../dist/celestial.js', import.meta.url);
const hook = registerHooks({
  load(path, context, next) {
    if (path !== url.href) return next(path, context);
    const source = readFileSync(url, 'utf8'),
      marker = 'function advanceCelestialOrbit(';
    assert.equal(source.split(marker).length, 2);
    return {
      format: 'module',
      shortCircuit: true,
      source:
        source.replace(marker, 'function referenceStep(') +
        '\nlet advanceCelestialOrbit = referenceStep; export function selectStep(step){advanceCelestialOrbit=step ?? referenceStep;}'
    };
  }
});
const {bodyState, MOON, PRIMARY, selectStep} = await import(url);
hook.deregister();
const {center} = await import('../dist/planet.js');
const {Vector3} = await import('three');
const {instance} = await WebAssembly.instantiate(
  readFileSync(new URL('../artifacts/celestial-kernel.wasm', import.meta.url))
);
const wasm = instance.exports,
  output = new Float64Array(wasm.memory.buffer);
export function prototypeStep(p, v, a, dt, time = 0) {
  const start = bodyState(MOON, time),
    end = bodyState(MOON, time + dt);
  const row =
    wasm.advance(
      p.x,
      p.y,
      p.z,
      v.x,
      v.y,
      v.z,
      a.x,
      a.y,
      a.z,
      dt,
      center.y,
      PRIMARY.mu,
      MOON.mu,
      MOON.sphereOfInfluence,
      start.position.y,
      start.position.z,
      start.velocity.y,
      start.velocity.z,
      end.position.y,
      end.position.z,
      end.velocity.y,
      end.velocity.z
    ) / 8;
  return {
    pos: new Vector3().fromArray(output, row),
    vel: new Vector3().fromArray(output, row + 3),
    bodyId: output[row + 6] ? 'moon' : 'planet'
  };
}
selectStep(prototypeStep);
export {selectStep};
