import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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
test('the blades are the widest sub-mesh centred on the shaft and turn in their own group', () => {
  const box = (w, h, d, x = 0, y = 0, z = 0) => {
    const g = new T.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    return new T.Mesh(g);
  };
  const model = new T.Group(),
    housing = box(0.36, 0.3, 0.36, 0, 0.1, 0),
    blades = box(0.8, 0.06, 0.8, 0, -0.19, 0),
    stripe = box(0.9, 0.02, 0.1, 0.4, 0, 0);
  model.add(housing, blades, stripe);
  const rotor = screwRotor(model);
  assert.ok(rotor);
  assert.equal(blades.parent, rotor);
  assert.equal(rotor.parent, model);
  assert.equal(housing.parent, model);
  assert.equal(stripe.parent, model, 'an off-centre piece does not turn');
  rotor.rotation.y = Math.PI / 2;
  model.updateMatrixWorld(true);
  const before = new T.Box3().setFromObject(blades);
  assert.ok(Math.abs(before.getCenter(new T.Vector3()).x) < 1e-9, 'the blades turn about the shaft');
  assert.equal(screwRotor(new T.Group()), null);
});
test('both screw models have a blade primitive that is the widest one centred on the shaft', () => {
  for (const [name, radius] of [
    ['propeller', 0.4],
    ['propellerLarge', 1.6]
  ]) {
    const glb = readFileSync(new URL(`../src/assets/parts/${name}.glb`, import.meta.url)),
      json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString()),
      bounds = json.meshes.flatMap(m => m.primitives.map(p => json.accessors[p.attributes.POSITION])),
      centred = bounds
        .map(a => ({r: Math.max(a.max[0], -a.min[0], a.max[2], -a.min[2]), a}))
        .filter(
          ({r, a}) => Math.abs(a.max[0] + a.min[0]) < r * 0.1 && Math.abs(a.max[2] + a.min[2]) < r * 0.1
        );
    const widest = Math.max(...centred.map(c => c.r));
    assert.ok(Math.abs(widest - radius) < 0.01, `${name}: ${widest}`);
  }
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
