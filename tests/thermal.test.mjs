import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {preset} from '../dist/catalog.js';
import {stagnationFlux, createThermal, shieldCoverage, thermalStep} from '../dist/thermal.js';
const defs = {
    payload: {mass: 100, size: [0.6, 1, 0.6], maxTemperature: 700},
    shield: {
      mass: 40,
      size: [2, 0.2, 2],
      heatShield: true,
      shieldRadius: 1,
      ablator: 10,
      maxTemperature: 1800
    }
  },
  payload = {id: 'p', type: 'payload', p: [0, 1, 0], r: [0, 0, 0]},
  shield = {id: 's', type: 'shield', p: [0, 0, 0], r: [0, 0, 0]},
  parts = [payload, shield],
  q = new T.Quaternion(),
  v = new T.Vector3(0, -2300, 0),
  air = {density: 0.025, temperature: 220};
test('Heating follows density square-root and speed cubed; vacuum and rest have no incident heat', () => {
  const f = stagnationFlux(0.01, 2000, 1);
  assert.equal(stagnationFlux(0, 2000, 1), 0);
  assert.equal(stagnationFlux(1, 0, 1), 0);
  assert.ok(Math.abs(stagnationFlux(0.04, 2000, 1) / f - 2) < 1e-12);
  assert.ok(Math.abs(stagnationFlux(0.01, 4000, 1) / f - 8) < 1e-12);
});
test('Shield protection requires upstream facing disk covering the entire part', () => {
  const direction = v.clone().normalize();
  assert.equal(shieldCoverage(payload, shield, direction, q, defs), true);
  assert.equal(shieldCoverage(payload, shield, direction.clone().negate(), q, defs), false);
  assert.equal(shieldCoverage({...payload, p: [1, 1, 0]}, shield, direction, q, defs), false);
  assert.equal(shieldCoverage(payload, {...shield, r: [Math.PI, 0, 0]}, direction, q, defs), false);
  const turn = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), 0.7);
  assert.equal(shieldCoverage(payload, shield, direction.clone().applyQuaternion(turn), turn, defs), true);
});
test('Shielded payload survives exposure that destroys an unprotected payload; ablator is finite', () => {
  const protectedState = createThermal(parts, defs),
    bareState = createThermal([payload], defs);
  for (let i = 0; i < 480; i++) {
    thermalStep(parts, protectedState, q, v, air, 0.5, defs);
    thermalStep([payload], bareState, q, v, air, 0.5, defs);
  }
  assert.equal(protectedState.get('p').failed, false);
  assert.equal(bareState.get('p').failed, true);
  assert.ok(protectedState.get('s').ablator < 10);
  assert.ok(protectedState.get('s').ablator >= 0);
  assert.ok(protectedState.get('p').temperature < bareState.get('p').temperature);
});
test('Vacuum cools without ablation and damage remains latched; step subdivision converges', () => {
  const a = createThermal(parts, defs),
    b = createThermal(parts, defs);
  a.get('p').temperature = 900;
  a.get('p').failed = true;
  thermalStep(parts, a, q, new T.Vector3(), {density: 0, temperature: 220}, 10, defs);
  assert.ok(a.get('p').temperature < 900);
  assert.ok(a.get('p').temperature > 3);
  assert.equal(a.get('p').failed, true);
  assert.equal(a.get('s').ablator, 10);
  const c = createThermal(parts, defs);
  thermalStep(parts, b, q, v, air, 2, defs);
  for (let i = 0; i < 40; i++) thermalStep(parts, c, q, v, air, 0.05, defs);
  assert.ok(Math.abs(b.get('s').temperature - c.get('s').temperature) < 1e-8);
  assert.ok(Math.abs(b.get('s').ablator - c.get('s').ablator) < 1e-8);
});
test('Ablation absorbs finite energy only on the exposed protective face', () => {
  const front = createThermal([shield], defs),
    back = createThermal([shield], defs);
  front.get('s').temperature = 650;
  front.get('s').ablator = 0.001;
  back.get('s').temperature = 650;
  thermalStep([shield], front, q, v, air, 1, defs);
  thermalStep([shield], back, q, v.clone().negate(), air, 1, defs);
  assert.equal(front.get('s').ablator, 0);
  assert.ok(front.get('s').temperature > 650);
  assert.equal(back.get('s').ablator, 10);
  assert.ok(back.get('s').temperature > 650);
});

test('Reentry shield uses the last fraction of ablator before heating and still covers its capsule', () => {
  const craft = preset('reentry');
  const state = createThermal(craft);
  const disk = craft.find(p => p.type === 'heatShield'),
    capsule = craft.find(p => p.type === 'capsule');
  const material = state.get(disk.id);
  material.temperature = 650;
  material.ablator = 0.001;
  // Pre-migration 120 Hz trajectory. Temperatures are in K, remaining mass in kg.
  const checkpoints = new Map([
    [2, [650, 0.000135624]],
    [3, [650.09415, 0]],
    [4, [650.23134, 0]],
    [120, [666.01864, 0]]
  ]);
  for (let tick = 1; tick <= 120; tick++) {
    const before = material.ablator;
    const reading = thermalStep(craft, state, q, v, air, 1 / 120);
    assert.ok(Math.abs(reading.consumed - (before - material.ablator)) < 1e-9);
    assert.equal(reading.parts.get(capsule.id).shielded, true);
    assert.deepEqual(reading.failed, []);
    if (checkpoints.has(tick)) {
      const [temp, kg] = checkpoints.get(tick);
      assert.ok(Math.abs(material.temperature - temp) < 0.01, 'shield temperature at tick ' + tick);
      if (kg === 0) assert.equal(material.ablator, 0);
      else assert.ok(Math.abs(material.ablator - kg) < 1e-7);
    }
  }
  assert.ok(Math.abs(state.get(capsule.id).temperature - 288.175) < 0.01);
});
