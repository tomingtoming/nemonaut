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
        source.replace(marker, 'function productStep(') +
        '\nlet advanceCelestialOrbit = productStep; export function selectStep(step){advanceCelestialOrbit=step ?? productStep;}'
    };
  }
});
const {selectStep, advanceCelestialOrbit: productStep} = await import(url);
hook.deregister();
const {referenceStep} = await import('./celestial-reference.mjs');
import {Vector3} from 'three';
const {Flight} = await import('../dist/core.js');
const {preset} = await import('../dist/catalog.js');
const {MOON, bodyState} = await import('../dist/celestial.js');
const {predictTrajectory} = await import('../dist/trajectory.js');
const {finiteBurnPreview} = await import('../dist/finite-burn.js');
const epoch = 45000,
  moon = bodyState(MOON, epoch);
const p = moon.position.clone().add(new Vector3(-MOON.sphereOfInfluence - 10000, 600000, 0));
const v = moon.velocity.clone().add(new Vector3(4000, 0, 0));
for (const path of ['flight', 'burn', 'flyby']) {
  const samples = [[], []];
  for (let trial = 0; trial < 11; trial++) {
    const ends = [];
    for (const index of [trial % 2, 1 - (trial % 2)]) {
      const trace = trial === 0 && index === 1;
      let calls = 0;
      if (trace)
        selectStep((...args) => {
          calls++;
          return productStep(...args);
        });
      else selectStep(index ? productStep : referenceStep);
      const flight = new Flight(
        preset(path === 'burn' ? 'returner' : 'orbiter'),
        path === 'flight' ? 'moon-orbit' : 'orbit',
        epoch
      );
      try {
        if (path === 'burn') {
          flight.stageNext();
          flight.stageNext();
        }
        flight.sas = false;
        calls = 0;
        const start = performance.now();
        let pos, vel;
        if (path === 'flight') {
          for (let i = 0; i < 7200; i++) flight.step(1 / 120);
          pos = flight.pos.clone().add(flight.stats.com.clone().applyQuaternion(flight.q));
          vel = flight.vel;
        } else if (path === 'burn') {
          const result = finiteBurnPreview(flight, new Vector3(0, 0, -50), epoch + 60, {throttle: 0.1});
          pos = result.points.at(-1);
          vel = result.orbit.relativeVelocity.clone().add(result.orbit.bodyVelocity);
        } else {
          const result = predictTrajectory(p, v, epoch, {duration: 1800});
          pos = new Vector3(...result.position);
          vel = new Vector3(...result.velocity);
          assert.deepEqual(
            result.events.map(e => e.type),
            ['enter-moon', 'leave-moon']
          );
        }
        if (trial >= 4) samples[index].push(performance.now() - start);
        if (trace) assert.ok(calls > 0, path + ' did not call the product engine');
        ends[index] = {pos: pos.clone(), vel: vel.clone()};
      } finally {
        flight.dispose();
      }
    }
    assert.ok(ends[0].pos.distanceTo(ends[1].pos) < 0.1 && ends[0].vel.distanceTo(ends[1].vel) < 0.001);
  }
  console.log({path, medianMs: samples.map(times => times.sort((a, b) => a - b)[3])});
}
