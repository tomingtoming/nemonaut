// Measure braking from a normal runway departure; no imposed pose or velocity.
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {runwayApproach, RUNWAY} from '../dist/runway-navigation.js';
import {surfaceRelativeVelocity} from '../dist/surface-frame.js';
for (const kind of ['plane', 'plane-large', 'transport-cargo'])
  for (const cutoff of [30, 50, 70]) {
    const f = new Flight(preset(kind), 'runway', 161700);
    f.stageNext();
    f.sas = false;
    f.brake = false;
    f.throttle = 1;
    let start = null,
      finish = null,
      groundExit = false,
      maxCross = 0,
      airborne = 0;
    try {
      for (let i = 0; i < 90 * 120 && !f.crashed; i++) {
        const center = f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));
        const speed = surfaceRelativeVelocity(center, f.vel, f.universalTime).length(),
          r = runwayApproach(center, f.universalTime, '09', f.vel),
          along = -r.remaining;
        maxCross = Math.max(maxCross, Math.abs(r.crossTrack));
        groundExit ||= along > RUNWAY.length || Math.abs(r.crossTrack) > RUNWAY.width / 2;
        if (!start && speed >= cutoff) {
          start = {time: f.time, along, speed, contacts: f.telemetry.contacts};
          f.throttle = 0;
          f.brake = true;
        }
        if (start && !f.telemetry.contacts) airborne += 1 / 120;
        if (start && speed < 0.5 && f.telemetry.contacts) {
          finish = {time: f.time, along, speed};
          break;
        }
        f.step(1 / 120, {});
      }
      console.log(
        JSON.stringify({
          kind,
          cutoff,
          start,
          finish,
          distance: finish && start ? finish.along - start.along : null,
          effectiveDeceleration:
            finish && start ? start.speed ** 2 / (2 * (finish.along - start.along)) : null,
          groundExit,
          maxCross,
          airborne,
          crashed: f.crashed
        })
      );
    } finally {
      f.dispose();
    }
  }
