import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {preset, part} from '../dist/catalog.js';
import {flapDeflection, partRotation, surfaceForce} from '../dist/aero.js';
import {Flight} from '../dist/core.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';

test('both mirrored wing flaps increase lift and drag at each deployment step in level flow', () => {
  for (const yaw of [0, Math.PI]) {
    const flap = part('flap', [0, 0, 0], [Math.PI / 2, yaw, 0]);
    let lift = -Infinity,
      drag = -Infinity;
    for (let stage = 0; stage <= 3; stage++) {
      const angle = flapDeflection(flap, stage);
      assert.ok(Math.abs(Math.abs(T.MathUtils.radToDeg(angle)) - stage * 5) < 1e-9);
      const {force} = surfaceForce(flap, partRotation(flap), new T.Vector3(0, 0, 55), 1.225, angle);
      assert.ok(force.y > lift && -force.z > drag);
      lift = force.y;
      drag = -force.z;
    }
  }
});
test('a mounted flap slews to stage three, round-trips, and retracts; older flights start clean', () => {
  const craft = preset('plane'),
    wing = craft.find(p => p.type === 'wing');
  const flap = part('flap', [1, 1, 0], [Math.PI / 2, 0, 0], wing.id);
  const f = new Flight([...craft, flap], 'orbit');
  try {
    f.flapStage = 3;
    f.step(1 / 120);
    assert.ok(Math.abs(f.deflections.get(flap.id)) > 0 && Math.abs(f.deflections.get(flap.id)) < 0.02);
    for (let i = 0; i < 40; i++) f.step(1 / 120);
    assert.equal(f.deflections.get(flap.id), flapDeflection(flap, 3));
    const saved = saveFlight(f);
    const restored = loadFlight(saved);
    try {
      assert.equal(restored.flapStage, 3);
      restored.flapStage = 0;
      for (let i = 0; i < 40; i++) restored.step(1 / 120);
      assert.equal(restored.deflections.get(flap.id), 0);
    } finally {
      restored.dispose();
    }
    delete saved.flapStage;
    const old = loadFlight(saved);
    try {
      assert.equal(old.flapStage, 0);
    } finally {
      old.dispose();
    }
    saved.flapStage = 4;
    assert.throws(() => loadFlight(saved));
  } finally {
    f.dispose();
  }
});
