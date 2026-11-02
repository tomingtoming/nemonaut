import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {bodyOrbitState} from '../dist/celestial.js';
import {centerOfVessel} from '../dist/relative-navigation.js';
import {timedRelativeStopPlan} from '../dist/timed-rendezvous.js';
test('Timed braking refuses an already immediate encounter without changing craft or fuel', () => {
  const f = new Flight(preset('rocket'), 'orbit'),
    g = new Flight(preset('rocket'), 'orbit');
  try {
    f.stageNext();
    g.pos.x += 100;
    f.vel.z += 20;
    const before = [...f.fuel],
      position = f.pos.clone();
    assert.throws(
      () => timedRelativeStopPlan(f, bodyOrbitState(centerOfVessel(g), g.vel, g.universalTime)),
      /60秒/
    );
    assert.deepEqual([...f.fuel], before);
    assert.deepEqual(f.pos, position);
  } finally {
    f.dispose();
    g.dispose();
  }
});
