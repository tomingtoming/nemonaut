// Node-only differential replay. Build the diagnostic Wasm as in thermal-kernel-profile.mjs.
import {registerHooks} from 'node:module';
import assert from 'node:assert/strict';
const target = new URL('../dist/thermal.js', import.meta.url).href;
registerHooks({
  load(url, context, next) {
    const result = next(url, context);
    if (url !== target) return result;
    const code = Buffer.from(result.source).toString();
    const signature = 'function thermalStep(parts, states, q, velocity, air, dt, definitions = PARTS) {';
    assert.equal(code.split(signature).length, 2, 'unexpected thermal entry point');
    return {
      ...result,
      source: code.replace(
        signature,
        signature +
          'return globalThis.compareThermal(referenceThermal,parts,states,q,velocity,air,dt,definitions);}\nfunction referenceThermal(parts,states,q,velocity,air,dt,definitions){'
      )
    };
  }
});
const {register, near, compare} = await import('./thermal-kernel-adapter.mjs');
const cached = new WeakMap();
const totals = {updates: 0, registrations: 0, setupMs: 0, rustMs: 0, tsMs: 0};
function matches(entry, parts, defs) {
  return (
    entry &&
    entry.shape.length === parts.length &&
    parts.every((p, i) => {
      const s = entry.shape[i];
      return (
        s.part === p &&
        s.id === p.id &&
        s.type === p.type &&
        s.definition === defs[p.type] &&
        p.p.every((x, j) => x === s.position[j]) &&
        p.r.every((x, j) => x === s.rotation[j])
      );
    })
  );
}
globalThis.compareThermal = (reference, parts, states, q, v, air, dt, defs) => {
  const copy = new Map([...states].map(([id, s]) => [id, {...s}]));
  const args = [q, v, air, dt];
  let expected, actual;
  const ts = () => {
    const start = performance.now();
    expected = reference(parts, copy, ...args, defs);
    totals.tsMs += performance.now() - start;
  };
  const rust = () => {
    const start = performance.now();
    let entry = cached.get(parts);
    if (!matches(entry, parts, defs)) {
      const begin = performance.now();
      entry = {
        run: register(parts, defs),
        shape: parts.map(p => ({
          part: p,
          id: p.id,
          type: p.type,
          definition: defs[p.type],
          position: [...p.p],
          rotation: [...p.r]
        }))
      };
      cached.set(parts, entry);
      totals.registrations++;
      totals.setupMs += performance.now() - begin;
    }
    actual = entry.run(states, ...args);
    totals.rustMs += performance.now() - start;
  };
  if (totals.updates % 2) {
    rust();
    ts();
  } else {
    ts();
    rust();
  }
  compare(expected, actual);
  for (const [id, s] of states) near(s.ablator, copy.get(id).ablator);
  totals.updates++;
  return actual;
};
process.on('exit', () => {
  if (totals.updates) console.log('thermal replay', JSON.stringify(totals));
});

export const thermalCounts = () => ({...totals});
