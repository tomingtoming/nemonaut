// Run after the build and standalone compilation described in kepler-kernel-profile.mjs.
// Inject the selectable solver into the loaded module only. Both paths use identical game callers.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import {Vector3} from 'three';
import {rustDrift} from './kepler-prototype.mjs';

const orbitUrl = new URL('../dist/coast-orbit.js', import.meta.url).href;
const hooks = registerHooks({
  load(url, context, next) {
    if (url !== orbitUrl) return next(url, context);
    const source = readFileSync(new URL(url), 'utf8');
    const marker = 'function keplerDrift(';
    assert.equal(source.split(marker).length, 2);
    return {
      format: 'module',
      shortCircuit: true,
      source:
        source.replace(marker, 'function originalDrift(') +
        '\nlet keplerDrift=originalDrift; export function setSolver(solver) { keplerDrift=solver ?? originalDrift; }'
    };
  }
});
const {setSolver} = await import(orbitUrl);
hooks.deregister();
const {Flight} = await import('../dist/core.js');
const {preset} = await import('../dist/catalog.js');
const {advanceCoastFleet} = await import('../dist/coast-flight.js');
const {maneuverPreview} = await import('../dist/maneuver.js');
const {MOON, bodyState} = await import('../dist/celestial.js');
const epoch = 40000;
const center = f => f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));
const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
for (const [site, stop] of [
  ['orbit', null],
  ['moon-orbit', null],
  ['transfer', 'maneuver'],
  ['air', 'surface'],
  ['soi-in', 'soi'],
  ['soi-out', 'soi']
]) {
  const coastTimes = [[], []],
    previewTimes = [[], []];
  let last;
  for (let trial = 0; trial < 15; trial++) {
    const ends = [];
    for (const index of [trial % 2, 1 - (trial % 2)]) {
      const trace = index === 1 && trial === 0;
      let calls = 0;
      if (trace)
        setSolver((...args) => {
          calls++;
          return rustDrift(...args);
        });
      else setSolver(index ? rustDrift : null);
      const f = new Flight(preset('orbiter'), stop === 'surface' || stop === 'soi' ? 'orbit' : site, epoch);
      try {
        if (stop === 'surface' || stop === 'soi') {
          const sign = site === 'soi-in' ? 1 : -1,
            moon = bodyState(MOON, epoch);
          const p =
            stop === 'surface'
              ? new Vector3(0, 76000, 0)
              : moon.position.clone().add(new Vector3(MOON.sphereOfInfluence + sign * 6000, 0, 0));
          f.pos.copy(p).sub(f.stats.com.clone().applyQuaternion(f.q));
          f.vel.copy(
            stop === 'surface'
              ? new Vector3(0, -200, 0)
              : moon.velocity.clone().add(new Vector3(-sign * 200, 0, 0))
          );
        }
        const p = center(f),
          v = f.vel.clone();
        let preview;
        if (!stop || stop === 'maneuver') {
          const when = {universalTime: epoch + (stop ? 45 : 120)};
          const start = performance.now();
          for (let i = 0; i < 1000; i++) preview = maneuverPreview(p, v, when, 0, epoch);
          if (trace) assert.ok(calls >= 1000);
          if (trial >= 6) previewTimes[index].push(performance.now() - start);
        }
        const start = performance.now();
        const beforeCoast = calls;
        const r = advanceCoastFleet(f, 120, {maxSteps: 256});
        const elapsed = performance.now() - start;
        if (trial >= 6) coastTimes[index].push(elapsed);
        if (trace) assert.ok(calls > beforeCoast);
        if (stop === 'soi') {
          const clearance =
            center(f).distanceTo(bodyState(MOON, f.universalTime).position) - MOON.sphereOfInfluence;
          assert.ok((site === 'soi-in' ? clearance : -clearance) >= 1000);
        }
        assert.equal(r.blocker?.code ?? null, stop);
        assert.ok(r.advanced > 0 && (stop ? r.advanced < 120 : r.advanced === 120));
        if (preview) {
          assert.ok(Math.abs(f.universalTime - preview.universalTime) < 1e-8);
          assert.ok(
            center(f).distanceTo(preview.burnPos) < 0.001 && f.vel.distanceTo(preview.burnVel) < 1e-5
          );
        }
        ends[index] = {
          position: center(f),
          velocity: f.vel.clone(),
          ut: f.universalTime,
          steps: r.steps,
          reason: r.reason,
          preview
        };
      } finally {
        f.dispose();
      }
    }
    const [ts, rs] = ends;
    assert.equal(ts.steps, rs.steps);
    assert.equal(ts.reason, rs.reason);
    assert.ok(Math.abs(ts.ut - rs.ut) < 1e-8);
    assert.ok(ts.position.distanceTo(rs.position) < 0.001 && ts.velocity.distanceTo(rs.velocity) < 1e-5);
    if (ts.preview)
      assert.ok(
        ts.preview.burnPos.distanceTo(rs.preview.burnPos) < 0.001 &&
          ts.preview.burnVel.distanceTo(rs.preview.burnVel) < 1e-5
      );
    last = {elapsed: rs.ut - epoch, steps: rs.steps, reason: rs.reason};
  }
  console.log({
    site,
    ...last,
    coastMs: coastTimes.map(median),
    previewMsPer1000: previewTimes[0].length ? previewTimes.map(median) : null
  });
}
