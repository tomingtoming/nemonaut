import {Flight, statistics} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {TakeoffPrototype} from '../dist/takeoff-prototype.js';
import {previewTakeoff} from '../dist/takeoff-preview.js';
import {rotationEstimate} from './rotation-estimate.mjs';
import {runwayApproach, RUNWAY} from '../dist/runway-navigation.js';
for (const kind of ['plane', 'plane-large', 'transport-cargo'])
  for (const fuel of [1, 0.5]) {
    const f = new Flight(preset(kind), 'runway', 161700);
    f.stageNext();
    for (const [id, v] of f.fuel) f.fuel.set(id, v * fuel);
    f.stats = statistics(f.parts, f.fuel, f.ballast, f.thermal);
    const p = new TakeoffPrototype(f, {
      speed: kind === 'plane' ? 120 : 90,
      rotation: 12,
      integral: true,
      handoff: 'attitude'
    });
    let decision = null,
      lastGround = null,
      rotation = null;
    try {
      for (let i = 0; i < 60 * 120 && !f.crashed; i++) {
        f.step(1 / 120, p.update(f, 1 / 120));
        const center = f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),
          r = runwayApproach(center, f.universalTime, '09', f.vel),
          speed = f.telemetry.surfaceSpeed,
          remaining = RUNWAY.length + r.remaining;
        if (f.telemetry.contacts) lastGround = {time: f.time, along: -r.remaining, speed};
        if (!decision && f.telemetry.contacts && remaining <= (speed * speed) / 12 + speed * 0.5 + 50)
          decision = {
            time: f.time,
            speed,
            remaining,
            pitch: p.telemetry.pitch,
            estimate: rotationEstimate(f, {density: f.telemetry.atmosphere.density}),
            currentEstimate: rotationEstimate(f, {density: f.telemetry.atmosphere.density, current: true}),
            preview: previewTakeoff(f, p)
          };
        if (!rotation && p.telemetry.pitch > 2) rotation = {time: f.time, speed, along: -r.remaining};
        if (f.orbit.altitude > 30 && !f.telemetry.contacts) break;
      }
      console.log(JSON.stringify({kind, fuel, decision, rotation, lastGround, crashed: f.crashed}));
    } finally {
      f.dispose();
    }
  }
