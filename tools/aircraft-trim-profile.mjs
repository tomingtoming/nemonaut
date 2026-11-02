import * as T from 'three';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {bodyUp} from '../dist/celestial.js';
import {surfaceRelativeVelocity} from '../dist/surface-frame.js';
// Diagnostic controller, not a player autopilot or proof of manual usability.
// All motion starts on the runway. Only ordinary control inputs are applied.
const trim = Number(process.argv[2] ?? 0),
  targetPitch = Number(process.argv[3] ?? 6);
if (
  !Number.isFinite(trim) ||
  Math.abs(trim) > 0.6 ||
  !Number.isFinite(targetPitch) ||
  Math.abs(targetPitch) > 20
)
  throw Error('Usage: node tools/aircraft-trim-profile.mjs [trim -0.6..0.6] [pitch -20..20]');
{
  const f = new Flight(preset('plane-large'), 'runway', 160799.2);
  f.stageNext();
  f.throttle = 1;
  let held = 0,
    peak = 0,
    touch = null,
    phase = 'climb';
  try {
    for (let i = 0; i < 360 * 120 && !f.crashed && !f.landed; i++) {
      const t = i / 120,
        h = f.orbit?.altitude ?? 0,
        vs = f.orbit?.vertical ?? 0,
        speed = surfaceRelativeVelocity(f.pos, f.vel, f.universalTime).length();
      let pitch = t >= 10 && t < 26 ? -1 : 0;
      if (t >= 50 && phase === 'climb') {
        phase = 'approach';
        f.throttle = 0.65;
        f.trim = trim;
      }
      if (phase === 'approach') {
        if (i % 60 === 0) {
          const attitude =
            (Math.asin(new T.Vector3(0, 0, 1).applyQuaternion(f.q).dot(bodyUp(f.pos, f.universalTime))) *
              180) /
            Math.PI;
          const rate = (-f.omega.clone().applyQuaternion(f.q.clone().invert()).x * 180) / Math.PI;
          const target = h > 40 ? targetPitch : targetPitch + 3;
          held = attitude + rate * 1 < target - 0.5 ? -1 : attitude + rate * 1 > target + 0.5 ? 1 : 0;
          f.throttle = Math.max(0, Math.min(1, f.throttle + (speed < 95 ? 0.01 : speed > 100 ? -0.01 : 0)));
        }
        pitch = held * 0.15;
      }
      f.step(1 / 120, {pitch});
      peak = Math.max(peak, f.orbit.altitude);
      if (phase === 'approach' && f.telemetry.contacts > 0) {
        touch = {t, vs: f.orbit.vertical, speed};
        phase = 'brake';
        f.throttle = 0;
        f.brake = true;
      }
      if (i % 3600 === 0)
        console.log(JSON.stringify({trim, targetPitch, t, h, vs, speed, throttle: f.throttle, phase}));
    }
    console.log(
      JSON.stringify({
        trim,
        targetPitch,
        peak,
        touch,
        landed: f.landed,
        crashed: f.crashed,
        alt: f.orbit.altitude,
        speed: surfaceRelativeVelocity(f.pos, f.vel, f.universalTime).length()
      })
    );
  } finally {
    f.dispose();
  }
}
