import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight, validateCraft} from '../dist/core.js';
import {preset, PARTS} from '../dist/catalog.js';
import {engineBurn, createFuel, fuelNetworks, stagePerformance} from '../dist/resources.js';
import {setPartThrustLimit} from '../dist/part-actions.js';
import {captureBurnEstimate} from '../dist/lunar-capture.js';
import {transferBurnTiming} from '../dist/timed-rendezvous.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
const close = (a, b, t = 1e-8) => assert.ok(Math.abs(a - b) < t, `${a} != ${b}`);
test('Independent engine limits multiply common throttle and conserve propellant across a cluster', () => {
  const parts = preset('launcher'),
    engines = parts.filter(p => PARTS[p.type].thrust && p.stage === 0),
    fuel = createFuel(parts),
    networks = fuelNetworks(parts),
    active = new Set(engines.map(p => p.id));
  engines[0].thrustLimit = 0.25;
  engines[1].thrustLimit = 0;
  const before = [...fuel.values()].reduce((a, b) => a + b, 0),
    forces = engineBurn(networks, fuel, active, 0.4, 0, 1),
    sum = [...forces.values()].reduce((a, b) => a + b, 0);
  close(forces.get(engines[0].id), 4500);
  assert.equal(forces.get(engines[1].id), 0);
  close(forces.get(engines[2].id), 18000);
  close(before - [...fuel.values()].reduce((a, b) => a + b, 0), sum / (300 * 9.81));
  const plan = stagePerformance(parts);
  close(plan[0].thrust, 101250);
  for (const e of engines) e.thrustLimit = 0;
  const frozen = [...fuel];
  engineBurn(networks, fuel, active, 1, 0, 1);
  assert.deepEqual([...fuel], frozen);
  assert.equal(
    stagePerformance(parts).some(p => p.stage === 0),
    false
  );
});
test('Actual impulse, finite-burn duration and precision timing all use the same limit', () => {
  const f = new Flight(preset('orbiter'), 'orbit');
  try {
    f.stageNext();
    f.sas = false;
    const engine = f.parts.find(p => p.type === 'engine'),
      full = captureBurnEstimate(f, 20),
      timing = transferBurnTiming(f, 20);
    assert.ok(setPartThrustLimit(f, engine.id, 0.5));
    const half = captureBurnEstimate(f, 20),
      slow = transferBurnTiming(f, 20);
    close(half.thrust, full.thrust * 0.5);
    close(half.duration, full.duration * 2, 0.002);
    close(half.fuelRequired, full.fuelRequired, 0.01);
    assert.ok(slow.duration > timing.duration * 1.9);
    assert.ok(slow.offset > timing.offset * 1.9);
    f.throttle = 0.4;
    f.step(1 / 120);
    close(f.engineThrust.get(engine.id), 9000);
    setPartThrustLimit(f, engine.id, 0);
    const fuel = [...f.fuel];
    f.step(1 / 120);
    assert.equal(f.lastThrust, 0);
    assert.deepEqual([...f.fuel], fuel);
    assert.equal(captureBurnEstimate(f, 20).enough, false);
  } finally {
    f.dispose();
  }
});
test('Limits survive save/restore, reject malformed saves, and do not alter blueprints or other equipment', () => {
  const blueprint = preset('rocket'),
    f = new Flight(blueprint, 'orbit');
  try {
    const engine = f.parts.find(p => p.type === 'engine'),
      core = f.parts.find(p => PARTS[p.type].control);
    assert.ok(setPartThrustLimit(f, engine.id, 0.37));
    assert.equal(blueprint.find(p => p.id === engine.id).thrustLimit, undefined);
    assert.equal(setPartThrustLimit(f, core.id, 0.5), false);
    for (const value of [-0.1, 1.1, NaN, Infinity, '0.5', null])
      assert.equal(setPartThrustLimit(f, engine.id, value), false);
    const save = saveFlight(f),
      g = loadFlight(save);
    close(g.parts.find(p => p.id === engine.id).thrustLimit, 0.37);
    g.dispose();
    for (const value of [-0.1, 1.1, NaN, Infinity, '0.5', null]) {
      const bad = structuredClone(blueprint);
      bad.find(p => p.id === engine.id).thrustLimit = value;
      assert.throws(() => validateCraft({version: 1, parts: bad}));
    }
    f.crashed = true;
    assert.equal(setPartThrustLimit(f, engine.id, 0.8), false);
  } finally {
    f.dispose();
  }
});
