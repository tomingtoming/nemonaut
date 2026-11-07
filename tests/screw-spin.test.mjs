import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {
  SCREW_SPIN_LAG,
  SCREW_TIP_SPEED,
  screwRotor,
  screwSpinStep,
  screwSpinTarget
} from '../dist/screw-spin.js';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';

test('the rotor speed follows the thrust given, and a larger screw turns more slowly', () => {
  assert.equal(screwSpinTarget(0, 6000, 0.4), 0);
  assert.equal(screwSpinTarget(6000, 6000, 0.4), SCREW_TIP_SPEED / 0.4);
  assert.equal(screwSpinTarget(1500, 6000, 0.4), SCREW_TIP_SPEED / 0.4 / 4);
  assert.equal(screwSpinTarget(9000, 6000, 0.4), SCREW_TIP_SPEED / 0.4, 'never above full thrust');
  assert.equal(screwSpinTarget(-5, 6000, 0.4), 0);
  assert.equal(screwSpinTarget(100, 0, 0.4), 0);
  assert.ok(screwSpinTarget(6000, 6000, 1.6) < screwSpinTarget(6000, 6000, 0.4));
  // At 60 frames per second the five blades (72° apart) advance well under half their spacing per frame.
  assert.ok(screwSpinTarget(1, 1, 0.4) / 60 < Math.PI / 5);
});
test('the rotor speeds up and runs down with a lag, and stands still without time', () => {
  assert.equal(screwSpinStep(3, 30, 0), 3);
  assert.ok(Math.abs(screwSpinStep(0, 30, SCREW_SPIN_LAG) - 30 * (1 - Math.exp(-1))) < 1e-12);
  let speed = 0;
  for (let i = 0; i < 300; i++) speed = screwSpinStep(speed, 30, 1 / 60);
  assert.ok(Math.abs(speed - 30) < 1e-3);
  for (let i = 0; i < 300; i++) speed = screwSpinStep(speed, 0, 1 / 60);
  assert.ok(speed < 1e-3);
});
test('only the declared blades turn, even inside a wider housing', () => {
  const model = new T.Group();
  const housing = new T.Mesh(new T.BoxGeometry(3, 1, 3));
  const blades = new T.Mesh(new T.BoxGeometry(1, 0.1, 1));
  blades.material.name = 'Blade metal';
  model.add(housing, blades);
  const pivot = [0.2, 0, 0];
  assert.equal(screwRotor(model, 'absent', pivot), null);
  const before = blades.getWorldPosition(new T.Vector3());
  const rotor = screwRotor(model, 'Blade metal', pivot);
  assert.equal(blades.parent, rotor);
  assert.equal(housing.parent, model);
  assert.ok(blades.getWorldPosition(new T.Vector3()).distanceTo(before) < 1e-9);
});
test('a screw gives thrust (and so turns) only when started, throttled and in the water', () => {
  const f = new Flight(preset('sub'), 'water');
  try {
    const screw = f.parts.find(p => p.type === 'propeller');
    assert.ok(screw);
    for (let i = 0; i < 120; i++) f.step(1 / 120);
    assert.equal(f.engineThrust.get(screw.id) || 0, 0, 'not started');
    f.stageNext();
    f.throttle = 0;
    for (let i = 0; i < 12; i++) f.step(1 / 120);
    assert.equal(f.engineThrust.get(screw.id) || 0, 0, 'zero throttle');
    f.throttle = 1;
    for (let i = 0; i < 12; i++) f.step(1 / 120);
    const thrust = f.engineThrust.get(screw.id) || 0;
    assert.ok(thrust > 0 && thrust <= 6000, String(thrust));
    assert.ok(screwSpinTarget(thrust, 6000, 0.4) > 0);
  } finally {
    f.dispose();
  }
});
