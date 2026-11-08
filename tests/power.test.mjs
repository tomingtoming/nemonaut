import test from 'node:test';
import {chargeCases} from './fixtures/charge-cases.mjs';
import assert from 'node:assert/strict';
import * as T from 'three';
import {sharedPhysics} from '../dist/physics.js';
import {Flight} from '../dist/core.js';
import {preset, part} from '../dist/catalog.js';
import {PLANET, center} from '../dist/planet.js';
import {
  SUN_DIRECTION,
  inEclipse,
  solarGeneration,
  createCharge,
  distributeCharge,
  powerStep,
  powerTotals
} from '../dist/power.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import {selectVessel} from '../dist/fleet.js';
const day = center.clone().addScaledVector(SUN_DIRECTION, PLANET.radius + 80000),
  night = center.clone().addScaledVector(SUN_DIRECTION, -PLANET.radius - 80000),
  q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), SUN_DIRECTION),
  idle = {pitch: 0, yaw: 0, roll: 0};
test('Panels generate with cosine incidence, stop facing away, and stop in planetary shadow', () => {
  const parts = [part('solar')];
  assert.equal(inEclipse(day), false);
  assert.equal(inEclipse(night), true);
  assert.ok(Math.abs(solarGeneration(parts, day, q) - 0.8) < 1e-9);
  assert.equal(solarGeneration(parts, night, q), 0);
  assert.equal(
    solarGeneration(
      parts,
      day,
      new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), SUN_DIRECTION.clone().negate())
    ),
    0
  );
  const side = new T.Vector3().crossVectors(SUN_DIRECTION, new T.Vector3(0, 1, 0)).normalize();
  assert.ok(
    solarGeneration(parts, day, new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), side)) < 1e-9
  );
});
test('Storage is bounded and energy accounting scales wheel torque at depletion', () => {
  const parts = [part('probe'), part('solar')],
    charge = createCharge(parts);
  charge.set(parts[0].id, 0.1);
  const result = powerStep(parts, charge, night, q, {pitch: 1, yaw: 0, roll: 0}, true, 1);
  assert.ok(Math.abs(result.ratio - 1 / 12) < 1e-9);
  assert.equal(result.stored, 0);
  assert.equal(result.consumption, 0.1);
  const recharge = powerStep(parts, charge, day, q, idle, false, 10);
  assert.ok(Math.abs(recharge.stored - 8) < 1e-9);
  powerStep(parts, charge, day, q, idle, false, 10000);
  assert.equal(powerTotals(parts, charge).stored, 200);
});
test('A powerless wheel cannot create torque, but sunlight restores usable charge', () => {
  const f = new Flight(preset('orbiter'), 'orbit');
  for (const id of f.charge.keys()) f.charge.set(id, 0);
  f.pos.copy(night);
  f.sas = false;
  const initial = f.q.clone();
  for (let i = 0; i < 120; i++) f.step(1 / 120, {pitch: 1});
  assert.ok(initial.angleTo(f.q) < 1e-6);
  assert.equal(f.telemetry.power.ratio, 0);
  f.pos.copy(day);
  f.q.copy(q);
  for (let i = 0; i < 120; i++) f.step(1 / 120);
  assert.ok(powerTotals(f.parts, f.charge).stored > 1);
  f.step(1 / 120, {pitch: 1});
  assert.ok(f.omega.length() > 0);
  f.dispose();
});
test('Wheel OFF prevents consumption without preventing solar charging', () => {
  const f = new Flight(preset('orbiter'), 'orbit');
  f.pos.copy(day);
  f.q.copy(q);
  for (const id of f.charge.keys()) f.charge.set(id, 50);
  f.reactionEnabled = false;
  f.step(1 / 120, {pitch: 1});
  assert.equal(f.telemetry.power.consumption, 0);
  assert.ok(powerTotals(f.parts, f.charge).stored > 50);
  f.dispose();
});
test('Separation, switching and save/restore preserve battery values without sharing', () => {
  const f = new Flight(preset('twin'), 'orbit'),
    ids = [...f.charge.keys()];
  f.charge.set(ids[0], 17);
  f.charge.set(ids[1], 43);
  f.stageNext();
  f.stageNext();
  const child = f.detached[0];
  assert.equal(powerTotals(f.parts, f.charge).stored, 17);
  assert.equal(powerTotals(child.parts, child.charge).stored, 43);
  const active = selectVessel(f, child),
    g = loadFlight(JSON.parse(JSON.stringify(saveFlight(active))));
  assert.deepEqual([...g.charge], [...active.charge]);
  assert.deepEqual([...g.detached[0].charge], [...f.charge]);
  g.charge.set(ids[1], 0);
  assert.equal(f.charge.get(ids[0]), 17);
  const bad = saveFlight(active);
  bad.charge[0][1] = 100000;
  assert.throws(() => loadFlight(bad));
  const old = saveFlight(active);
  delete old.charge;
  const migrated = loadFlight(old);
  assert.equal(powerTotals(migrated.parts, migrated.charge).stored, 200);
  active.dispose();
  g.dispose();
  migrated.dispose();
});

test('vessel charge allocation preserves per-battery shares, curtailment and direct solar supply', () => {
  const near = (value, expected) => assert.ok(Math.abs(value - expected) < 1e-9, value + ' vs ' + expected);
  for (const [initial, generation, load, dt, target, delivered, supply] of chargeCases) {
    const batteries = initial.length ? [part('probe'), part('battery')] : [];
    const parts = [...batteries, part('solar')];
    const charge = new Map(batteries.map((p, i) => [p.id, initial[i]]));
    const flightCharge = new Map(charge);
    const actual = distributeCharge(parts, charge, generation, load, dt);
    const live = powerStep(parts, flightCharge, generation ? day : night, q, idle, false, dt, 0, load);
    for (const [reading, state] of [
      [actual, charge],
      [live, flightCharge]
    ]) {
      near(reading.consumption, delivered);
      near(reading.ratio, supply);
      near(
        reading.stored,
        target.reduce((a, b) => a + b, 0)
      );
      near(reading.net, (reading.stored - initial.reduce((a, b) => a + b, 0)) / dt);
      assert.equal(state.size, batteries.length);
      batteries.forEach((p, i) => near(state.get(p.id), target[i]));
    }
  }
});

test('a restored separated craft draws power only from its own probe', () => {
  const f = new Flight(preset('twin'), 'orbit');
  let restored;
  try {
    f.pos.copy(night);
    f.sas = false;
    f.step(1 / 120);
    const [upper, lower] = [...f.charge.keys()];
    f.charge.set(upper, 17);
    f.charge.set(lower, 43);
    f.stageNext();
    f.stageNext();
    const child = f.detached[0];
    const save = saveFlight(f);
    restored = loadFlight(JSON.parse(JSON.stringify(save)));
    restored.sas = restored.detached[0].sas = false;
    restored.step(1 / 120, {pitch: 1});
    assert.deepEqual([...restored.charge.keys()], [upper]);
    assert.ok(restored.charge.get(upper) < 17 && restored.charge.get(upper) > 16);
    assert.deepEqual([...restored.detached[0].charge], [[lower, 43]]);
    assert.deepEqual([...f.charge], [[upper, 17]]);
    assert.deepEqual([...child.charge], [[lower, 43]]);
  } finally {
    restored?.dispose();
    f.dispose();
  }
});

test('charge scratch follows shared memory growth and the current vessel', () => {
  const first = [part('probe')],
    second = [part('battery')];
  const firstCharge = createCharge(first),
    secondCharge = createCharge(second);
  distributeCharge(first, firstCharge, 0, 1, 1);
  const held = firstCharge.get(first[0].id),
    initial = secondCharge.get(second[0].id);
  sharedPhysics().memory.grow(1);
  distributeCharge(second, secondCharge, 0, 2, 1);
  assert.equal(secondCharge.get(second[0].id), initial - 2);
  assert.equal(firstCharge.get(first[0].id), held);
});
