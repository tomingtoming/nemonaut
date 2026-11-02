// Controlled 40-second stabilization, then 1.2-second manual input. Not a UI-flight replay.
import * as T from 'three';
import {preset} from '../dist/catalog.js';
import {bodyUp, bodyAltitude} from '../dist/celestial.js';
import {surfaceVelocity} from '../dist/surface-frame.js';
for (const input of [0, -1, 1]) {
  const {Flight} = await import('../dist/core.js');
  const craft = preset('transport-cargo');
  craft.find(p => p.type === 'cargoBay').cargoOpen = true;
  const f = new Flight(craft, 'runway', 161700);
  f.stageNext();
  f.throttle = 0.35;
  const up = bodyUp(f.pos, f.universalTime),
    forward = new T.Vector3(0, 0, 1).applyQuaternion(f.q);
  f.q.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), (-6 * Math.PI) / 180));
  f.holdQ = f.q.clone();
  f.pos.addScaledVector(
    up,
    1000 - bodyAltitude(f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)), f.universalTime)
  );
  f.vel
    .copy(surfaceVelocity(f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)), f.universalTime))
    .addScaledVector(forward, 75)
    .addScaledVector(up, -3);
  const pitch = () =>
    (Math.asin(new T.Vector3(0, 0, 1).applyQuaternion(f.q).dot(bodyUp(f.pos, f.universalTime))) * 180) /
    Math.PI;
  try {
    for (let i = 0; i < 40 * 120; i++) f.step(1 / 120);
    const before = {h: f.orbit.altitude, pitch: pitch(), vs: f.orbit.vertical};
    for (let i = 0; i < 144; i++) f.step(1 / 120, {pitch: input});
    const release = {pitch: pitch(), vs: f.orbit.vertical};
    let minPitch = Infinity,
      minVertical = Infinity;
    for (let i = 0; i < 10 * 120; i++) {
      f.step(1 / 120);
      minPitch = Math.min(minPitch, pitch());
      minVertical = Math.min(minVertical, f.orbit.vertical);
    }
    console.log(
      JSON.stringify({
        input,
        before,
        release,
        minPitch,
        minVertical,
        after: {pitch: pitch()},
        crashed: f.crashed
      })
    );
  } finally {
    f.dispose();
  }
}
