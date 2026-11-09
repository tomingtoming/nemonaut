import assert from 'node:assert/strict';
import {Flight} from '../../dist/core.js';
import {preset} from '../../dist/catalog.js';
for (const kind of ['boat', 'sub', 'sub-large']) {
  const times = [];
  for (let round = 0; round < 8; round++) {
    const f = new Flight(preset(kind), 'water', 161700);
    try {
      f.ballast = kind === 'boat' ? 0 : 1;
      f.stageNext();
      f.throttle = 0.6;
      const start = performance.now();
      for (let i = 0; i < 720; i++) f.step(1 / 120, {yaw: 0.15});
      const elapsed = performance.now() - start;
      assert.ok(!f.crashed && Number.isFinite(f.vel.length()));
      if (round >= 3) times.push(elapsed);
    } finally {
      f.dispose();
    }
  }
  console.log(
    kind,
    '720 steps (ms)',
    times.sort((a, b) => a - b)
  );
}
