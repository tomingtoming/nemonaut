import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {sasTrim, seedSasTrim} from '../dist/sas-trim.js';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';

test('aircraft hold rejects sustained aerodynamic bias after manual rotation', () => {
  const f = new Flight(preset('plane'), 'runway', 159542);
  try {
    f.throttle = 1;
    f.stageNext();
    let largest = 0;
    for (let i = 0; i < 65 * 120; i++) {
      const t = i / 120;
      f.step(1 / 120, {pitch: t > 10 && t < 28 ? -1 : 0});
      if (t > 50) largest = Math.max(largest, f.q.angleTo(f.holdQ));
    }
    assert.equal(f.crashed, false);
    assert.ok(f.orbit.altitude > 300);
    assert.ok(largest < (3 * Math.PI) / 180, `settled attitude error ${(largest * 180) / Math.PI}`);
  } finally {
    f.dispose();
  }
});

test('trim cannot wind up into saturation, unsupported axes or a new control session', () => {
  const v = {sasMode: 'hold'},
    axes = {x: true, y: false, z: false};
  for (let i = 0; i < 10000; i++) sasTrim(v, new T.Vector3(1, 1, 1), new T.Vector3(), axes, 1 / 120, true);
  assert.deepEqual(sasTrim(v, new T.Vector3(), new T.Vector3(), axes, 0, true).toArray(), [0.8, 0, 0]);
  assert.equal(sasTrim(v, new T.Vector3(1, 0, 0), new T.Vector3(1, 0, 0), axes, 1, true).x, 0.8);
  assert.ok(sasTrim(v, new T.Vector3(-0.1, 0, 0), new T.Vector3(1, 0, 0), axes, 1, true).x < 0.8);
  assert.equal(sasTrim(v, null, null, null, 1, false).length(), 0);
  assert.equal(sasTrim(v, new T.Vector3(), new T.Vector3(), axes, 1, true).length(), 0);
  sasTrim(v, new T.Vector3(0.2, 0, 0), new T.Vector3(), axes, 1, true);
  v.sasMode = 'prograde';
  assert.equal(sasTrim(v, new T.Vector3(), new T.Vector3(), axes, 0, true).length(), 0);
});

test('explicit handoff matches actuator output once and remains bounded to supported axes', () => {
  const v = {sas: true, sasMode: 'hold'},
    axes = {x: true, y: false, z: true},
    base = new T.Vector3(0.1, 0.2, -0.1),
    zero = new T.Vector3();
  assert.equal(seedSasTrim(v, {pitch: -0.5, yaw: 0.5, roll: 0.2}), true);
  const bias = sasTrim(v, zero, base, axes, 0, true).clone();
  assert.ok(Math.abs(bias.x + base.x + 0.5) < 1e-12);
  assert.equal(bias.y, 0);
  assert.ok(Math.abs(bias.z + base.z - 0.2) < 1e-12);
  assert.deepEqual(sasTrim(v, zero, new T.Vector3(0.3, 0, 0), axes, 0, true).toArray(), bias.toArray());
  seedSasTrim(v, {pitch: -1, yaw: 0, roll: 1});
  assert.deepEqual(sasTrim(v, zero, new T.Vector3(1, 0, -1), axes, 0, true).toArray(), [-0.8, 0, 0.8]);
});

test('handoff state is discarded on disable, mode change and new vessel; invalid commands are rejected', () => {
  const axes = {x: true, y: true, z: true},
    zero = new T.Vector3(),
    commands = {pitch: -0.5, yaw: 0, roll: 0};
  for (const transition of ['disable', 'mode', 'vessel']) {
    let v = {sas: true, sasMode: 'hold'};
    seedSasTrim(v, commands);
    if (transition === 'disable') sasTrim(v, null, null, null, 0, false);
    if (transition === 'mode') v.sasMode = 'prograde';
    if (transition === 'vessel') v = {sas: true, sasMode: 'hold'};
    assert.equal(sasTrim(v, zero, zero, axes, 0, true).length(), 0);
  }
  for (const commands of [null, {pitch: NaN, yaw: 0, roll: 0}, {pitch: 2, yaw: 0, roll: 0}])
    assert.equal(seedSasTrim({sas: true, sasMode: 'hold'}, commands), false);
  assert.equal(seedSasTrim({sas: false, sasMode: 'hold'}, commands), false);
  assert.equal(seedSasTrim({sas: true, sasMode: 'prograde'}, commands), false);
});
