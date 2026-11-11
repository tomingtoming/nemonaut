import {bodyDrag} from '../dist/body-drag.js';
import * as T from 'three';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {surfaceVelocity, surfaceRelativeVelocity} from '../dist/surface-frame.js';
import {atmosphere, altitude} from '../dist/planet.js';

// Approximates a steep entry observed in play, not an exact saved-flight replay.
const profiles = [];
for (const dt of [1 / 120, 1 / 240])
  for (const scenario of ['observed-steep', 'entry-preset']) {
    const f = new Flight(preset('returner'), scenario === 'entry-preset' ? 'entry' : 'orbit');
    f.stageNext();
    f.stageNext();
    f.stageNext();
    for (const child of f.detached) child.dispose();
    f.detached = [];
    f.throttle = 0;
    f.sas = true;
    f.sasMode = 'retrograde';
    f.navigationFrame = 'surface';
    f.armParachutes();
    if (scenario === 'observed-steep') {
      f.pos.set(0, 187230, 0);
      f.q.identity();
      f.omega.set(0, 0, 0);
      f.universalTime = 199958;
      const com = f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));
      f.vel.copy(surfaceVelocity(com, f.universalTime)).add(new T.Vector3(0, -1280, 73));
    }
    const gates = [70000, 40000, 20000, 10000, 5000, 1500, 500, 50].filter(h => h < altitude(f.pos)),
      rows = [];
    let t = 0,
      peakSpeed = 0;
    while (t < 1200 && !f.crashed && !f.landed) {
      f.step(dt);
      t += dt;
      const com = f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),
        v = surfaceRelativeVelocity(com, f.vel, f.universalTime),
        h = f.orbit.altitude,
        speed = v.length();
      peakSpeed = Math.max(peakSpeed, speed);
      if (gates.length && h < gates[0]) {
        const gate = gates.shift(),
          axis = new T.Vector3(0, 1, 0).applyQuaternion(f.q),
          error = (axis.angleTo(v.clone().negate()) * 180) / Math.PI,
          density = atmosphere(h).density;
        rows.push({
          time: +t.toFixed(2),
          gate,
          altitude: Math.round(h),
          speed: Math.round(speed),
          attitudeErrorDeg: +error.toFixed(2),
          density: +density.toFixed(4),
          cdArea: +bodyDrag(f.bodyAerodynamics, f.q, v, density).cdArea.toFixed(3),
          dragN: Math.round(bodyDrag(f.bodyAerodynamics, f.q, v, density).force.length()),
          mass: Math.round(f.stats.mass),
          chute: [...f.chutes.values()][0].status
        });
      }
    }
    profiles.push({
      scenario,
      dt,
      initialStateIsApproximate: scenario === 'observed-steep',
      duration: +t.toFixed(1),
      peakSpeed: Math.round(peakSpeed),
      landed: f.landed,
      crashed: f.crashed,
      rows
    });
    f.dispose();
  }

console.log(JSON.stringify(profiles, null, 2));
