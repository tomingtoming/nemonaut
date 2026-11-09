import {Flight} from '../../dist/core.js';
import {preset} from '../../dist/catalog.js';
import {bodyUp} from '../../dist/celestial.js';
import {surfaceVelocity} from '../../dist/surface-frame.js';
import {Vector3} from 'three';
for (const kind of ['plane', 'transport-cargo']) {
  const times = [];
  for (let round = 0; round < 8; round++) {
    const f = new Flight(preset(kind), 'runway', 161700);
    f.pos.addScaledVector(bodyUp(f.pos, f.universalTime), 1200);
    f.vel.copy(surfaceVelocity(f.pos, f.universalTime)).add(new Vector3(1, -2, 90).applyQuaternion(f.q));
    const start = performance.now();
    for (let i = 0; i < 720; i++) f.step(1 / 120, {roll: 0.06, pitch: 0.04});
    const elapsed = performance.now() - start;
    if (f.crashed || !Number.isFinite(f.vel.length()))
      throw Error('Flight crashed or velocity became nonfinite');
    if (round >= 3) times.push(elapsed);
    f.dispose();
  }
  console.log(
    kind,
    times.sort((a, b) => a - b)
  );
}
