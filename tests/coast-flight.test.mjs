import {referenceCooling} from '../tools/coast-cooling-reference.mjs';
import {bodyState, referenceBody} from '../dist/celestial.js';
import {surfaceRelativeVelocity, inertialToFixed, surfaceOrientation} from '../dist/surface-frame.js';
const surfaceSpeed = f =>
  surfaceRelativeVelocity(
    f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),
    f.vel,
    f.universalTime
  ).length();
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Flight} from '../dist/core.js';
import {preset, part} from '../dist/catalog.js';
import {
  advanceCoastFleet,
  coastEligibility,
  coolVacuum,
  isParked,
  coolStationary
} from '../dist/coast-flight.js';
import {atmosphere} from '../dist/planet.js';
import {createThermal} from '../dist/thermal.js';
import {thermalStep} from '../tools/golden/thermal-reference.mjs';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import {selectVessel, fleet} from '../dist/fleet.js';

const center = f => f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));

test('Sub-ULP remainder after a completed coast is not a flight hazard, but an unadvanceable request is rejected', () => {
  const f = new Flight(preset('rover'), 'land', 105093.8);
  try {
    for (let i = 0; i < 240; i++) f.step(1 / 120);
    assert.ok(isParked(f));
    const start = f.universalTime,
      r = advanceCoastFleet(f, 30 + 1e-12, {maxSteps: 100});
    assert.equal(r.reason, null);
    assert.equal(r.blocker, null);
    assert.equal(r.advanced, 30);
    assert.ok(r.remaining > 0 && r.remaining < 1e-10);
    assert.equal(f.universalTime, start + 30);
    const saved = saveFlight(f),
      tiny = advanceCoastFleet(f, 1e-20);
    assert.equal(tiny.blocker.code, 'precision');
    assert.equal(tiny.advanced, 0);
    assert.deepEqual(saveFlight(f), saved);
  } finally {
    f.dispose();
  }
});

test('Coast matches nonrotating unpowered Flight with SAS off, including energy and cooling', () => {
  const f = new Flight(preset('orbiter'), 'moon-orbit', 40000);
  let slow;
  try {
    f.sas = false;
    for (const id of f.charge.keys()) f.charge.set(id, 0);
    slow = loadFlight(saveFlight(f));
    const fuel = [...f.fuel];
    const result = advanceCoastFleet(f, 120);
    assert.equal(result.advanced, 120);
    assert.equal(result.reason, null);
    for (let i = 0; i < 14400; i++) slow.step(1 / 120);
    assert.ok(center(f).distanceTo(center(slow)) < 0.1);
    assert.ok(f.vel.distanceTo(slow.vel) < 0.01);
    assert.ok(f.q.angleTo(slow.q) < 0.001);
    for (const [id, s] of f.thermal)
      assert.ok(Math.abs(s.temperature - slow.thermal.get(id).temperature) < 0.1);
    for (const [id, n] of f.charge) assert.ok(Math.abs(n - slow.charge.get(id)) < 1);
    assert.deepEqual([...f.fuel], fuel);
    assert.equal(f.universalTime, 40120);
  } finally {
    slow?.dispose();
    f.dispose();
  }
});

test('Coast shares UT with retained vessels and survives saving and switching control', () => {
  let a = new Flight(preset('orbiter'), 'orbit', 100);
  const b = new Flight(preset('orbiter'), 'moon-orbit', 100);
  let restored;
  try {
    // Give the independently constructed craft unique part IDs, as launch does.
    for (const p of b.parts) {
      const old = p.id;
      p.id = 'moon-' + old;
      if (p.parent) p.parent = 'moon-' + p.parent;
      for (const map of [b.fuel, b.charge, b.thermal, b.observations])
        if (map.has(old)) {
          map.set(p.id, map.get(old));
          map.delete(old);
        }
    }
    a.detached.push(b);
    const result = advanceCoastFleet(a, 60);
    assert.equal(result.advanced, 60);
    assert.ok(fleet(a).every(v => v.universalTime === 160 && v.time === 60));
    restored = loadFlight(saveFlight(a));
    restored = selectVessel(restored, restored.detached[0]);
    assert.equal(advanceCoastFleet(restored, 10).advanced, 10);
    assert.ok(fleet(restored).every(v => v.universalTime === 170));
    restored.step(1 / 120);
    assert.ok(fleet(restored).every(v => v.universalTime === restored.universalTime));
  } finally {
    restored?.dispose();
    a.dispose();
  }
});

test('Coast rejects thrust, input and unsafe fleet members without partial mutation', () => {
  const a = new Flight(preset('orbiter'), 'orbit'),
    b = new Flight(preset('rocket'), 'land');
  try {
    a.detached.push(b);
    const before = saveFlight(a);
    assert.equal(advanceCoastFleet(a, 100).advanced, 0);
    assert.deepEqual(saveFlight(a), before);
    a.detached = [];
    a.throttle = 0.1;
    assert.equal(coastEligibility(a), '推力設定のある機体');
    a.throttle = 0;
    assert.equal(advanceCoastFleet(a, 10, {input: true}).advanced, 0);
    assert.equal(a.universalTime, 0);
  } finally {
    a.dispose();
    b.dispose();
  }
});

test('Burn deadline stops 15 seconds early and bounded work leaves a remaining duration', () => {
  const f = new Flight(preset('orbiter'), 'transfer', 100);
  try {
    const q = f.q.clone(),
      omega = new T.Vector3(0.003, 0.005, -0.002);
    f.omega.copy(omega);
    const first = advanceCoastFleet(f, 100, {maxSteps: 2});
    assert.equal(first.steps, 2);
    assert.ok(first.advanced > 0 && first.advanced <= 10);
    assert.equal(first.remaining, 100 - first.advanced);
    assert.deepEqual(f.q.toArray(), q.toArray());
    assert.deepEqual(f.omega.toArray(), omega.toArray());
    const second = advanceCoastFleet(f, 100);
    assert.equal(f.universalTime, 145);
    assert.equal(second.reason, '予定噴射の直前');
    assert.equal(f.transferGuide.delivered, 0);
  } finally {
    f.dispose();
  }
});

test('Vacuum cooling preserves ablator and approaches short-step radiation for hot parts', () => {
  const parts = preset('orbiter'),
    fast = createThermal(parts),
    slow = createThermal(parts);
  for (const states of [fast, slow]) for (const s of states.values()) s.temperature = 1000;
  const fuel = [...fast].map(([id, s]) => [id, s.ablator]);
  coolVacuum(parts, fast, 300);
  for (let i = 0; i < 6000; i++)
    thermalStep(
      parts,
      slow,
      new T.Quaternion(),
      new T.Vector3(),
      {density: 0, pressure: 0, temperature: 3},
      0.05
    );
  for (const [id, s] of fast) assert.ok(Math.abs(s.temperature - slow.get(id).temperature) < 0.5);
  assert.deepEqual(
    [...fast].map(([id, s]) => [id, s.ablator]),
    fuel
  );
});

test('A settled ground vehicle remains on the surface while an orbital fleet advances', () => {
  const ground = new Flight(preset('rover'), 'land');
  let orbit;
  try {
    for (let i = 0; i < 1200; i++) ground.step(1 / 120);
    assert.ok(isParked(ground), 'actual ground physics must establish parking');
    orbit = new Flight(preset('orbiter'), 'orbit', ground.universalTime);
    orbit.detached.push(ground);
    const p = inertialToFixed(ground.pos, ground.universalTime),
      q = ground.q.clone().premultiply(surfaceOrientation(ground.universalTime).invert()),
      fuel = [...ground.fuel],
      time = ground.time;
    const result = advanceCoastFleet(orbit, 300, {maxSteps: 200});
    assert.equal(result.advanced, 300);
    assert.equal(result.reason, null);
    assert.ok(inertialToFixed(ground.pos, ground.universalTime).distanceTo(p) < 1e-7);
    assert.ok(
      ground.q.clone().premultiply(surfaceOrientation(ground.universalTime).invert()).angleTo(q) < 1e-7
    );
    assert.ok(surfaceSpeed(ground) < 0.1);
    assert.deepEqual([...ground.fuel], fuel);
    assert.ok(ground.landed);
    assert.ok(Math.abs(ground.time - time - 300) < 1e-8);
    assert.equal(ground.universalTime, orbit.universalTime);
    ground.vel.x = 1;
    assert.equal(isParked(ground), false);
    assert.equal(advanceCoastFleet(orbit, 10).advanced, 0);
  } finally {
    if (orbit) orbit.dispose();
    else ground.dispose();
  }
});

test('Stationary atmosphere cooling matches the normal thermal model without freezing temperature', () => {
  const parts = preset('orbiter'),
    fast = createThermal(parts),
    slow = createThermal(parts),
    air = atmosphere(0);
  for (const states of [fast, slow]) for (const s of states.values()) s.temperature = 500;
  coolStationary(parts, fast, 300, air);
  for (let i = 0; i < 6000; i++) thermalStep(parts, slow, new T.Quaternion(), new T.Vector3(), air, 0.05);
  for (const [id, s] of fast) {
    assert.ok(s.temperature < 500);
    assert.ok(s.temperature >= air.temperature);
    assert.ok(Math.abs(s.temperature - slow.get(id).temperature) < 0.5);
  }
});

test('parked rover survives repeated coast, physics and save restoration without vessel switching', () => {
  for (const brake of [true, false]) {
    let f = new Flight(preset('rover'), 'land', 74193.2);
    try {
      f.brake = brake;
      for (let i = 0; i < 600; i++) f.step(1 / 120);
      const position = inertialToFixed(center(f), f.universalTime),
        fuel = [...f.fuel];
      for (let cycle = 0; cycle < 60; cycle++) {
        const result = advanceCoastFleet(f, 1000, {maxSteps: 200});
        assert.equal(result.reason, null, `brake=${brake}, cycle=${cycle}`);
        assert.equal(result.advanced, 1000);
        for (let i = 0; i < 120; i++) f.step(1 / 120);
        const restored = loadFlight(saveFlight(f));
        f.dispose();
        f = restored;
        assert.ok(isParked(f));
        assert.equal(f.brake, brake);
        assert.ok(
          inertialToFixed(center(f), f.universalTime).distanceTo(position) < 0.1,
          'surface location stays fixed'
        );
        assert.deepEqual([...f.fuel], fuel);
      }
      // A saved landed flag must not exempt a moving vehicle from surface checks.
      f.vel.x += 1;
      const moving = loadFlight(saveFlight(f));
      f.dispose();
      f = moving;
      assert.equal(isParked(f), false);
      assert.equal(advanceCoastFleet(f, 1000).advanced, 0);
    } finally {
      f.dispose();
    }
  }
});

test('parking rejects spinning extremities and a resting rover wakes on drive input', () => {
  const f = new Flight(preset('rover'), 'land');
  try {
    for (let i = 0; i < 1200; i++) f.step(1 / 120);
    assert.ok(isParked(f));
    f.stageNext();
    f.brake = false;
    for (let i = 0; i < 240; i++) f.step(1 / 120, {drive: 1});
    assert.ok(surfaceSpeed(f) > 0.5);
    assert.equal(isParked(f), false);
  } finally {
    f.dispose();
  }
  const rod = new Flight([part('probe', [0, 0, 0]), part('truss', [0, 100, 0])], 'land');
  try {
    rod.landed = true;
    rod.landedTime = 10;
    rod.omega.x += 0.015;
    assert.equal(isParked(rod), false);
  } finally {
    rod.dispose();
  }
});

test('Coasting a hot reentry shield retains its last gram across save and return to fixed ticks', () => {
  const f = new Flight(preset('reentry'), 'moon-orbit', 40000);
  let slow, resumed;
  try {
    f.sas = false;
    const id = f.parts.find(p => p.type === 'heatShield').id;
    Object.assign(f.thermal.get(id), {temperature: 666.02, ablator: 0.001});
    slow = loadFlight(saveFlight(f));
    const result = advanceCoastFleet(f, 60);
    assert.equal(result.reason, null);
    assert.equal(result.advanced, 60);
    for (let i = 0; i < 7200; i++) slow.step(1 / 120);
    for (const flight of [f, slow]) {
      const shield = flight.thermal.get(id);
      assert.equal(shield.ablator, 0.001);
      assert.equal(shield.failed, false);
      assert.ok(Math.abs(shield.temperature - 596.49) < 0.05);
    }
    resumed = loadFlight(saveFlight(f));
    assert.deepEqual(resumed.thermal.get(id), f.thermal.get(id));
    const before = resumed.thermal.get(id).temperature;
    resumed.step(1 / 120);
    assert.ok(resumed.thermal.get(id).temperature < before);
    assert.equal(resumed.thermal.get(id).ablator, 0.001);
  } finally {
    resumed?.dispose();
    slow?.dispose();
    f.dispose();
  }
});

test('orbital and parked temperatures follow the reference across interrupted and restored fleet coast', () => {
  const rover = new Flight(preset('rover'), 'land');
  let orbit, restored;
  try {
    for (let i = 0; i < 1200; i++) rover.step(1 / 120);
    orbit = new Flight(preset('reentry'), 'moon-orbit', rover.universalTime);
    orbit.detached.push(rover);
    for (const [v, temperature] of [
      [orbit, 700],
      [rover, 170]
    ])
      for (const state of v.thermal.values()) state.temperature = temperature;
    const reference = [structuredClone(orbit.thermal), structuredClone(rover.thermal)];
    const position = center(rover),
      body = referenceBody(position, rover.universalTime);
    const air = atmosphere(position.distanceTo(bodyState(body, rover.universalTime).position) - body.radius);
    function check(active, steps) {
      const start = active.universalTime;
      assert.equal(advanceCoastFleet(active, 30, {maxSteps: steps}).advanced, steps * 5);
      for (const [i, vessel] of [active, active.detached[0]].entries()) {
        assert.equal(vessel.universalTime, start + steps * 5);
        for (let n = 0; n < steps; n++)
          referenceCooling(vessel.parts, reference[i], 5, i === 0 ? {temperature: 3, density: 0} : air);
        for (const [id, state] of vessel.thermal) {
          const expected = reference[i].get(id);
          assert.ok(Math.abs(expected.temperature - state.temperature) < 1e-8);
          assert.equal(state.ablator, expected.ablator);
          assert.equal(state.failed, expected.failed);
        }
      }
    }
    check(orbit, 2);
    const saved = saveFlight(orbit);
    assert.equal(advanceCoastFleet(orbit, 30, {input: true}).advanced, 0);
    assert.deepEqual(saveFlight(orbit), saved);
    restored = loadFlight(saved);
    check(restored, 4);
  } finally {
    restored?.dispose();
    if (orbit) orbit.dispose();
    else rover.dispose();
  }
});
