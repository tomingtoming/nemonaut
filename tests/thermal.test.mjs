import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Flight} from '../dist/core.js';
import {flightThermalStep} from '../dist/flight-thermal.js';
import {preset, PARTS} from '../dist/catalog.js';
import {createThermal} from '../dist/thermal.js';
// Catalog parts in the layout of the reentry preset: the shield's ablative face (local -Y) leads.
const payload = {id: 'p', type: 'capsule', p: [0, 0, 0], r: [0, 0, 0]},
  shield = {id: 's', type: 'heatShield', p: [0, -0.79, 0], r: [0, 0, 0]},
  parts = [payload, shield],
  q = new T.Quaternion(),
  v = new T.Vector3(0, -2300, 0),
  air = {density: 0.025, temperature: 220};
// flightThermalStep only needs a physics world for its Wasm exports; the flight itself is never stepped.
function thermalWorld(t) {
  const flight = new Flight(preset('reentry'), 'orbit');
  t.after(() => flight.dispose());
  return flight.world;
}
test('Heating follows density square-root and speed cubed; vacuum and rest have no incident heat', t => {
  const world = thermalWorld(t),
    reading = (density, speed) =>
      flightThermalStep(
        world,
        [payload],
        createThermal([payload]),
        q,
        new T.Vector3(0, -speed, 0),
        {density, temperature: 220},
        1 / 120
      ).parts.get('p');
  const f = reading(0.01, 2000).flux;
  assert.ok(f > 0);
  assert.equal(reading(0, 2000).flux, 0);
  assert.equal(reading(0, 2000).heat, 0);
  assert.equal(reading(1, 0).flux, 0);
  assert.equal(reading(1, 0).heat, 0);
  assert.ok(Math.abs(reading(0.04, 2000).flux / f - 2) < 1e-12);
  assert.ok(Math.abs(reading(0.01, 4000).flux / f - 8) < 1e-12);
});
test('Shield protection requires upstream facing disk covering the entire part', t => {
  const world = thermalWorld(t),
    shielded = (craft, attitude, velocity) =>
      flightThermalStep(world, craft, createThermal(craft), attitude, velocity, air, 1 / 120).parts.get('p')
        .shielded;
  assert.equal(shielded(parts, q, v), true);
  assert.equal(shielded(parts, q, v.clone().negate()), false);
  assert.equal(shielded([{...payload, p: [1, 0, 0]}, shield], q, v), false);
  assert.equal(shielded([payload, {...shield, r: [Math.PI, 0, 0]}], q, v), false);
  const turn = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), 0.7);
  assert.equal(shielded(parts, turn, v.clone().applyQuaternion(turn)), true);
});
test('Shielded payload survives exposure that destroys an unprotected payload; ablator is finite', t => {
  const world = thermalWorld(t),
    protectedState = createThermal(parts),
    bareState = createThermal([payload]);
  // 240 s at 3200 m/s in 0.06 kg/m³: the bare capsule passes its 1100 K limit after about 200 s
  // (it would settle near 1210 K), the shield stays below its 1800 K limit (about 1710 K).
  const entry = new T.Vector3(0, -3200, 0),
    dense = {density: 0.06, temperature: 220};
  for (let i = 0; i < 480; i++) flightThermalStep(world, parts, protectedState, q, entry, dense, 0.5);
  for (let i = 0; i < 480; i++) flightThermalStep(world, [payload], bareState, q, entry, dense, 0.5);
  assert.equal(protectedState.get('p').failed, false);
  assert.equal(bareState.get('p').failed, true);
  assert.ok(protectedState.get('s').ablator < PARTS.heatShield.ablator);
  assert.ok(protectedState.get('s').ablator >= 0);
  assert.ok(protectedState.get('p').temperature < bareState.get('p').temperature);
});
test('Vacuum cools without ablation and damage remains latched; step subdivision converges', t => {
  const world = thermalWorld(t),
    a = createThermal(parts),
    b = createThermal(parts);
  a.get('p').temperature = 900;
  a.get('p').failed = true;
  flightThermalStep(world, parts, a, q, new T.Vector3(), {density: 0, temperature: 220}, 10);
  assert.ok(a.get('p').temperature < 900);
  assert.ok(a.get('p').temperature > 3);
  assert.equal(a.get('p').failed, true);
  assert.equal(a.get('s').ablator, PARTS.heatShield.ablator);
  const c = createThermal(parts);
  flightThermalStep(world, parts, b, q, v, air, 2);
  for (let i = 0; i < 40; i++) flightThermalStep(world, parts, c, q, v, air, 0.05);
  assert.ok(Math.abs(b.get('s').temperature - c.get('s').temperature) < 1e-8);
  assert.ok(Math.abs(b.get('s').ablator - c.get('s').ablator) < 1e-8);
});
test('Ablation absorbs finite energy only on the exposed protective face', t => {
  const world = thermalWorld(t),
    front = createThermal([shield]),
    back = createThermal([shield]);
  front.get('s').temperature = 650;
  front.get('s').ablator = 0.001;
  back.get('s').temperature = 650;
  flightThermalStep(world, [shield], front, q, v, air, 1);
  flightThermalStep(world, [shield], back, q, v.clone().negate(), air, 1);
  assert.equal(front.get('s').ablator, 0);
  assert.ok(front.get('s').temperature > 650);
  assert.equal(back.get('s').ablator, PARTS.heatShield.ablator);
  assert.ok(back.get('s').temperature > 650);
});

test('Reentry shield uses the last fraction of ablator before heating and still covers its capsule', t => {
  const craft = preset('reentry');
  const flight = new Flight(craft, 'orbit');
  t.after(() => flight.dispose());
  const state = flight.thermal;
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
    const reading = flightThermalStep(flight.world, craft, state, q, v, air, 1 / 120);
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
