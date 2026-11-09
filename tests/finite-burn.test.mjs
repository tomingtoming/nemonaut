import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Flight} from '../dist/core.js';
import {part, preset} from '../dist/catalog.js';
import {finiteBurnPreview} from '../dist/finite-burn.js';
import {deorbitPlan} from '../dist/deorbit-plan.js';

test('atmospheric forecast excludes folded gear while preserving its mass', () => {
  const f = new Flight(preset('returner'), 'orbit');
  try {
    f.stageNext();
    f.stageNext();
    const center = f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));
    const {preview} = deorbitPlan(center, f.vel, 0, {delay: 360});
    const predict = () => finiteBurnPreview(f, preview.impulse, 360, {throttle: 0.01});
    // Hold mass, COM, fuel and thrust fixed so only the exposed drag geometry changes.
    const reference = predict();
    f.parts.push(part('maingear', [12, 0, 0]));
    f.gearDeployed = false;
    const folded = predict();
    f.gearDeployed = true;
    const extended = predict();
    assert.ok(folded.atmospheric && extended.atmospheric);
    assert.equal(folded.orbit.periapsis, reference.orbit.periapsis);
    assert.ok(Math.abs(extended.orbit.periapsis - folded.orbit.periapsis) > 0.01);
  } finally {
    f.dispose();
  }
});
test('finite comparison rejects unsupported inputs without consuming live fuel', () => {
  const f = new Flight(preset('returner'), 'orbit');
  try {
    const impulse = new T.Vector3(0, 0, -50);
    assert.throws(() => finiteBurnPreview(f, impulse, 60));
    f.stageNext();
    f.stageNext();
    const before = [...f.fuel];
    for (const throttle of [0, -1, 2, NaN])
      assert.throws(() => finiteBurnPreview(f, impulse, 60, {throttle}));
    assert.throws(() => finiteBurnPreview(f, impulse, -1));
    assert.throws(() => finiteBurnPreview(f, impulse, 60, {step: 0}));
    assert.throws(() => finiteBurnPreview(f, impulse, 60, {throttle: 0.00001}));
    f.throttle = 0.1;
    assert.throws(() => finiteBurnPreview(f, impulse, 60));
    f.throttle = 0;
    assert.deepEqual([...f.fuel], before);
    for (const id of f.fuel.keys()) f.fuel.set(id, 0);
    assert.throws(() => finiteBurnPreview(f, impulse, 60), /燃料/);
  } finally {
    f.dispose();
  }
});
test('finite comparison converges as integration step is halved', () => {
  const f = new Flight(preset('returner'), 'orbit');
  try {
    f.stageNext();
    f.stageNext();
    const p = deorbitPlan(f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)), f.vel, 0, {
      delay: 360
    });
    const a = finiteBurnPreview(f, p.preview.impulse, 360, {throttle: 0.01, step: 0.1}),
      b = finiteBurnPreview(f, p.preview.impulse, 360, {throttle: 0.01, step: 0.05});
    assert.ok(a.atmospheric);
    assert.ok(Math.abs(a.orbit.periapsis - b.orbit.periapsis) < 2);
    assert.ok(Math.abs(a.duration - b.duration) < 0.01);
    assert.ok(a.points.length > 2);
  } finally {
    f.dispose();
  }
});
