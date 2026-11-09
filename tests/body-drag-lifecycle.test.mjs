import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {deorbitPlan} from '../dist/deorbit-plan.js';
import {finiteBurnPreview} from '../dist/finite-burn.js';
import {createBodyAerodynamics as reference} from '../tools/golden/body-drag-reference.mjs';

const wind = new Vector3(0.7, 0.4, 0.8);
function checkShape(f) {
  const expected = reference(f.parts, f.gearDeployed).dragArea(wind);
  const actual = f.bodyAerodynamics.dragArea(wind);
  assert.ok(Math.abs(actual - expected) < 1e-8);
  return actual;
}

test('staging and an atmospheric forecast keep independent shapes for parent and detached vessels', () => {
  const f = new Flight(preset('returner'), 'orbit');
  try {
    const old = f.bodyAerodynamics;
    f.stageNext();
    f.stageNext();
    assert.ok(f.detached.length > 0);
    assert.ok(Number.isNaN(old.dragArea(wind)));
    const children = f.detached.map(checkShape);
    const parent = checkShape(f);
    assert.ok(children.some(area => area !== parent));
    const center = f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));
    const {preview} = deorbitPlan(center, f.vel, 0, {delay: 360});
    assert.ok(finiteBurnPreview(f, preview.impulse, 360, {throttle: 0.01}).atmospheric);
    assert.equal(checkShape(f), parent);
    assert.deepEqual(f.detached.map(checkShape), children);
  } finally {
    f.dispose();
  }
  assert.ok(Number.isNaN(f.bodyAerodynamics.dragArea(wind)));
});

test('fracture gives the remaining airframe and its debris their own drag models', () => {
  const f = new Flight(preset('rocket'), 'orbit');
  try {
    const before = checkShape(f);
    f.fractureParts([f.parts.find(p => p.type === 'tank').id]);
    assert.ok(f.detached.length > 0);
    assert.notEqual(checkShape(f), before);
    f.detached.forEach(checkShape);
  } finally {
    f.dispose();
  }
});
