import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {preset} from '../dist/catalog.js';
import {createFuel} from '../dist/resources.js';
import {thrustBalance, stageThrustDiagnostics, equipmentDiagnostics} from '../dist/design-diagnostics.js';

test('Symmetric expedition stages balance thrust and preserve design data', () => {
  const parts = preset('lunar-expedition'),
    before = structuredClone(parts),
    result = stageThrustDiagnostics(parts);
  assert.deepEqual(
    result.stages.map(s => s.stage),
    [0, 1, 2]
  );
  assert.deepEqual(
    result.stages.map(s => s.partIds.length),
    [29, 13, 8]
  );
  for (const stage of result.stages) {
    assert.ok(stage.full.offset < 1e-10);
    assert.ok(stage.low.offset < 1e-10);
    assert.ok(stage.full.mass > stage.low.mass);
  }
  assert.deepEqual(parts, before);
});

test('Inactive stages retain the actual return capsule and its recovery equipment', () => {
  const parts = preset('lunar-expedition'),
    before = structuredClone(parts),
    all = stageThrustDiagnostics(parts, null, {includeInactive: true});
  assert.deepEqual(
    all.stages.map(s => s.partIds.length),
    [29, 13, 8, 3, 3]
  );
  for (const s of all.stages.slice(3)) {
    assert.deepEqual(
      parts
        .filter(p => s.partIds.includes(p.id))
        .map(p => p.type)
        .sort(),
      ['capsule', 'heatShield', 'parachute'].sort()
    );
    assert.equal(s.full.thrust, 0);
    assert.equal(s.full.offset, null);
    assert.deepEqual(s.full, s.low);
    assert.equal(s.equipment.controls.length, 1);
    assert.equal(s.equipment.shields.length, 1);
    assert.equal(s.equipment.chutes.length, 1);
    assert.equal(s.equipment.wheels.length, 1);
    assert.equal(s.equipment.solar.length, 0);
    assert.equal(s.equipment.capacity, 1000);
  }
  assert.equal(all.stages[3].actions[0].kind, 'separate');
  assert.equal(all.stages[4].actions[0].kind, 'chute');
  assert.equal(all.stages[4].actions[0].retained, true);
  const thrustOnly = stageThrustDiagnostics(parts);
  assert.deepEqual(all.stages.slice(0, 3), thrustOnly.stages);
  assert.deepEqual(parts, before);
});

test('No-thrust diagnostics distinguish atmosphere, fuel, pending ignition and unsupported water drive', () => {
  const parts = [
    {id: 'c', type: 'cockpit', p: [0, 2, 0], r: [0, 0, 0], stage: 0, parent: null},
    {id: 't', type: 'tank', p: [0, 0, 0], r: [0, 0, 0], stage: 0, parent: 'c'},
    {id: 'j', type: 'jet', p: [0, -2, 0], r: [0, 0, 0], stage: 2, parent: 't'},
    {id: 'ch', type: 'parachute', p: [0, 3, 0], r: [0, 0, 0], stage: 3, parent: 'c'}
  ];
  const vacuum = stageThrustDiagnostics(parts, null, {density: 0, includeInactive: true});
  assert.deepEqual(vacuum.stages[0].engineStates[0].reasons, ['not-ignited', 'atmosphere']);
  assert.deepEqual(vacuum.stages[2].engineStates[0].reasons, ['atmosphere']);
  assert.equal(vacuum.stages[0].actions.length, 0);
  const sea = stageThrustDiagnostics(parts, null, {includeInactive: true});
  assert.ok(sea.stages[2].full.thrust > 0);
  assert.deepEqual(sea.stages[3].engineStates[0].reasons, ['fuel']);
  const noTank = parts.filter(p => p.id !== 't').map(p => (p.id === 'j' ? {...p, parent: 'c'} : p));
  assert.ok(
    stageThrustDiagnostics(noTank, null, {includeInactive: true}).stages[2].engineStates[0].reasons.includes(
      'fuel'
    )
  );
  const boat = preset('boat'),
    water = stageThrustDiagnostics(boat, null, {includeInactive: true});
  assert.ok(water.stages.some(s => s.engineStates.some(e => e.reasons.includes('water'))));
});

test('Off-axis engine exposes a moment arm and off-axis fuel changes it', () => {
  const parts = preset('lunar-return'),
    engine = parts.find(p => p.type === 'engine'),
    tank = parts.find(p => p.type === 'tank');
  engine.p[0] = 1;
  tank.p[0] = 2;
  const fuel = createFuel(parts),
    before = [...fuel],
    active = new Set([engine.id]);
  const full = thrustBalance(parts, active, fuel);
  assert.ok(full.offset > 0.1);
  fuel.set(tank.id, fuel.get(tank.id) * 0.1);
  const low = thrustBalance(parts, active, fuel);
  assert.ok(Math.abs(full.com[0] - low.com[0]) > 0.7);
  assert.ok(
    full.torque[2] < 0 && low.torque[2] > 0,
    'Fuel depletion moves the CG across the thrust line and reverses the moment'
  );
  assert.ok(Math.abs(full.torque[2] - (engine.p[0] - full.com[0]) * full.thrust) < 1e-7);
  const translated = parts.map(p => ({
    ...p,
    p: new T.Vector3(...p.p).add(new T.Vector3(100, -20, 40)).toArray()
  }));
  assert.ok(Math.abs(thrustBalance(translated, active, new Map(before)).offset - full.offset) < 1e-10);
  assert.deepEqual([...createFuel(parts)], before);
});

test('Opposed thrusters report a pure couple rather than an invented thrust line', () => {
  const parts = [
    {id: 'tank', type: 'tank', p: [0, 0, 0], r: [0, 0, 0], stage: 0, parent: null},
    {id: 'a', type: 'engine', p: [1, -2, 0], r: [0, 0, 0], stage: 0, parent: 'tank'},
    {id: 'b', type: 'engine', p: [-1, -2, 0], r: [0, 0, Math.PI], stage: 0, parent: 'tank'}
  ];
  const result = thrustBalance(parts, new Set(['a', 'b']));
  assert.equal(result.offset, null);
  assert.ok(result.thrust < 1e-8);
  assert.ok(Math.abs(result.torque[2]) > 80000);
});

test('Equipment counts respect disabled reaction wheels and report actual control surfaces', () => {
  const parts = preset('lunar-return');
  parts.find(p => p.type === 'capsule').reactionEnabled = false;
  const result = equipmentDiagnostics(parts);
  assert.equal(result.wheels.length, 0);
  assert.equal(result.shields.length, 1);
  assert.equal(result.chutes.length, 1);
  assert.ok(result.capacity > 0);
  const wing = {id: 'e', type: 'elevator', p: [0, 0, 0], r: [0, 0, 0], stage: 0, parent: null};
  assert.deepEqual(equipmentDiagnostics([wing]).surfaces, ['e']);
  assert.deepEqual(stageThrustDiagnostics([wing]).stages, []);
});

test('Vacuum jet stages do not consume fuel reserved for a later rocket stage', () => {
  const parts = [
    {id: 'c', type: 'cockpit', p: [0, 2, 0], r: [0, 0, 0], stage: 0, parent: null},
    {id: 't', type: 'tank', p: [0, 0, 0], r: [0, 0, 0], stage: 0, parent: 'c'},
    {id: 'j', type: 'jet', p: [0, -2, 0], r: [0, 0, 0], stage: 0, parent: 't'},
    {id: 'e', type: 'engine', p: [0, -4, 0], r: [0, 0, 0], stage: 1, parent: 't'}
  ];
  const result = stageThrustDiagnostics(parts, null, {density: 0});
  assert.deepEqual(
    result.stages.map(s => s.stage),
    [1]
  );
  assert.equal(result.stages[0].full.thrust, 45000);
  assert.ok(Math.abs(result.stages[0].full.mass - result.stages[0].low.mass - 1620) < 1e-8);
});
