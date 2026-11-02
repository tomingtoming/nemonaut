import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {part} from '../dist/catalog.js';
import {Flight, validateCraft} from '../dist/core.js';
import {dockVessels, undockVessel} from '../dist/docking.js';
import {portPose} from '../dist/port-navigation.js';
import {transferTargets} from '../dist/fuel-transfer.js';
import {setPartAction} from '../dist/part-actions.js';
import {engineBurn} from '../dist/resources.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import {editSymmetrySetting} from '../dist/symmetry.js';
function vessel() {
  const root = part('probe'),
    tank = part('tank', [0, -2, 0], [0, 0, 0], root.id),
    port = part('dockingPort', [0, 0.321, 0], [0, 0, 0], root.id),
    engine = part('engine', [0, -4, 0], [0, 0, 0], tank.id),
    rcs = part('rcs', [1, 0, 0], [0, 0, 0], root.id);
  return {
    f: new Flight([root, tank, port, engine, rcs], 'orbit'),
    tank: tank.id,
    port: port.id,
    engine: engine.id,
    rcs: rcs.id
  };
}
function pair() {
  const a = vessel(),
    b = vessel();
  a.f.q.identity();
  b.f.q.setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI);
  a.f.pos.set(0, 80000, 0);
  b.f.pos.copy(a.f.pos);
  b.f.pos.add(portPose(a.f, a.port).position.sub(portPose(b.f, b.port).position));
  a.f.vel.set(0, 0, 0);
  b.f.vel.set(0, 0, 0);
  a.f.detached = [b.f];
  return {a, b};
}
test('Dock, isolate, refuel, save, undock: resources follow their original tanks', () => {
  const {a, b} = pair();
  a.f.fuel.set(a.tank, 0);
  let f = dockVessels(a.f, b.f, a.port, b.port);
  try {
    assert.ok(transferTargets(f, a.tank).some(p => p.id === b.tank));
    for (const id of [a.port, b.port]) {
      assert.ok(setPartAction(f, id, 'fuelCrossfeed', false));
      assert.equal(f.transferFuel(b.tank, a.tank, 100), 0);
      assert.equal(engineBurn(f.networks, new Map(f.fuel), new Set([a.engine]), 1, 0, 1).get(a.engine), 0);
      assert.ok(setPartAction(f, id, 'fuelCrossfeed', true));
    }
    assert.ok(engineBurn(f.networks, new Map(f.fuel), new Set([a.engine]), 1, 0, 1).get(a.engine) > 0);
    assert.equal(f.transferFuel(b.tank, a.tank, 300), 300);
    assert.equal(f.fuel.get(b.tank), 1500);
    setPartAction(f, a.port, 'fuelCrossfeed', false);
    const saved = loadFlight(saveFlight(f));
    f.dispose();
    f = saved;
    assert.equal(f.parts.find(p => p.id === a.port).fuelCrossfeed, false);
    assert.equal(f.transferFuel(b.tank, a.tank, 100), 0);
    f = undockVessel(f, a.port);
    assert.equal(f.fuel.get(a.tank), 300);
    assert.equal(f.detached[0].fuel.get(b.tank), 1500);
    assert.equal(f.transferFuel(b.tank, a.tank, 100), 0);
  } finally {
    f.dispose();
  }
});
test('RCS refueling respects port valves and never mixes with main engine propellant', () => {
  const {a, b} = pair();
  a.f.fuel.set(a.rcs, 0);
  let f = dockVessels(a.f, b.f, a.port, b.port);
  try {
    assert.ok(transferTargets(f, a.rcs).some(p => p.id === b.rcs));
    assert.ok(!transferTargets(f, a.rcs).some(p => p.type === 'tank'));
    assert.equal(f.transferFuel(b.tank, a.rcs, 1), 0);
    assert.equal(f.transferFuel(b.rcs, a.rcs, 5), 5);
    setPartAction(f, b.port, 'fuelCrossfeed', false);
    assert.equal(f.transferFuel(b.rcs, a.rcs, 1), 0);
    f = undockVessel(f, a.port);
    assert.equal(f.fuel.get(a.rcs), 5);
    assert.equal(f.detached[0].fuel.get(b.rcs), 7);
  } finally {
    f.dispose();
  }
});
test('Port crossfeed design settings validate capability and persist through launch', () => {
  const {f, port, tank} = vessel();
  try {
    const parts = editSymmetrySetting(f.parts, port, 'fuelCrossfeed', false);
    assert.equal(validateCraft({version: 1, parts}).find(p => p.id === port).fuelCrossfeed, false);
    assert.throws(() => editSymmetrySetting(parts, tank, 'fuelCrossfeed', false));
    const bad = structuredClone(parts);
    bad.find(p => p.id === tank).fuelCrossfeed = true;
    assert.throws(() => validateCraft({version: 1, parts: bad}));
  } finally {
    f.dispose();
  }
});
