import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {AscentPrototype} from './ascent-prototype.mjs';

for (const kind of ['launcher', 'atlas'])
  for (const altitude of [90000, 120000, 200000]) {
    const f = new Flight(preset(kind), 'land'),
      pilot = new AscentPrototype({altitude});
    try {
      for (let i = 0; i < 1200 * 120 && !pilot.done && !f.crashed; i++) {
        pilot.update(f);
        f.step(1 / 120);
      }
      console.log(
        JSON.stringify({
          kind,
          target: altitude,
          time: f.time,
          phase: pilot.phase,
          done: pilot.done,
          crashed: f.crashed,
          stage: f.stage,
          periapsis: f.orbit.periapsis,
          apoapsis: f.orbit.apoapsis,
          fuel: f.fuelRatio,
          throttle: f.throttle
        })
      );
    } finally {
      f.dispose();
    }
  }
