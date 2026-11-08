import {fleet} from '../dist/fleet.js';
import * as T from 'three';
import {surfaceVelocity} from '../dist/surface-frame.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight, statistics} from '../dist/core.js';
import {part, preset, PARTS} from '../dist/catalog.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import {dockVessels, undockVessel} from '../dist/docking.js';
test('Ablator contributes actual mass and COM; hot states survive separation and save without sharing', () => {
  const parts = preset('returner'),
    f = new Flight(parts, 'orbit'),
    shield = f.parts.find(p => p.type === 'heatShield'),
    initial = statistics(f.parts, f.fuel, f.ballast, f.thermal);
  f.thermal.get(shield.id).ablator = 7;
  f.thermal.get(shield.id).temperature = 720;
  const changed = statistics(f.parts, f.fuel, f.ballast, f.thermal);
  assert.ok(Math.abs(initial.mass - changed.mass - 33) < 1e-9);
  assert.ok(initial.com.distanceTo(changed.com) > 0);
  const tank = f.parts.find(p => p.type === 'tank');
  f.thermal.get(tank.id).temperature = 430;
  while (f.stage < 2) f.stageNext();
  assert.equal(f.thermal.get(shield.id).temperature, 720);
  assert.equal(f.thermal.has(tank.id), false);
  const child = f.detached.find(v => v.parts.some(p => p.id === tank.id));
  assert.equal(child.thermal.get(tank.id).temperature, 430);
  const g = loadFlight(saveFlight(f));
  assert.deepEqual([...g.thermal], [...f.thermal]);
  assert.equal(g.thermal.get(shield.id).ablator, 7);
  g.thermal.get(shield.id).temperature = 300;
  assert.equal(f.thermal.get(shield.id).temperature, 720);
  const old = saveFlight(f);
  delete old.thermal;
  const migrated = loadFlight(old);
  assert.equal(migrated.thermal.get(shield.id).ablator, 40);
  for (const mutate of [
    s => (s.thermal[0][1].temperature = Infinity),
    s => (s.thermal = []),
    s => (s.thermal.find(([id]) => id === shield.id)[1].ablator = 41),
    s => (s.thermal[0][1].failed = 'yes')
  ]) {
    const s = saveFlight(f);
    mutate(s);
    assert.throws(() => loadFlight(s));
  }
  f.dispose();
  g.dispose();
  migrated.dispose();
});
test('Docking and undocking preserve distinct temperatures and shield inventory', () => {
  const parts = preset('docking'),
    ports = parts.filter(p => p.type === 'dockingPort');
  parts.push(part('heatShield', [0, -2.3, 0], [0, 0, 0], parts[0].id));
  let f = new Flight(parts, 'orbit');
  const shield = f.parts.find(p => p.type === 'heatShield');
  f.thermal.get(shield.id).ablator = 9;
  f.thermal.get(ports[1].id).temperature = 500;
  f = undockVessel(f, ports[0].id);
  const other = f.detached[0];
  f.vel.copy(other.vel);
  f = dockVessels(f, other, ports[0].id, ports[1].id);
  assert.equal(f.thermal.get(shield.id).ablator, 9);
  assert.equal(f.thermal.get(ports[1].id).temperature, 500);
  const g = loadFlight(saveFlight(f));
  assert.deepEqual([...g.thermal], [...f.thermal]);
  f.dispose();
  g.dispose();
});
test('High-energy 7 km/s entry ablates shield-first; reversed and missing shields fail thermally', () => {
  for (const mode of ['correct', 'reverse', 'bare']) {
    const parts = preset('reentry');
    if (mode === 'bare')
      parts.splice(
        parts.findIndex(p => p.type === 'heatShield'),
        1
      );
    const f = new Flight(parts, 'entry');
    f.pos.set(0, 70000, 0);
    f.q.identity();
    f.vel.copy(surfaceVelocity(f.pos)).add(new T.Vector3(0, -7000, 0));
    f.navigationFrame = 'surface';
    f.sasMode = 'retrograde';
    f.armParachutes();
    if (mode === 'reverse') {
      f.sasMode = 'prograde';
      f.q.setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI);
    }
    let max = 0;
    for (let i = 0; i < 1000 * 60 && !f.crashed && !f.landed; i++) {
      f.step(1 / 60);
      max = Math.max(max, ...[...f.thermal.values()].map(s => s.temperature));
    }
    if (mode === 'correct') {
      assert.equal(f.crashed, false);
      assert.ok(f.landed);
      const shield = f.parts.find(p => p.type === 'heatShield');
      assert.ok(f.thermal.get(shield.id).ablator < PARTS.heatShield.ablator);
      assert.ok(max >= 650);
    } else {
      assert.ok(
        fleet(f).some(v => [...v.thermal.values()].some(s => s.failed)),
        mode
      );
      assert.ok(
        fleet(f).some(v => v.failureEvents.some(e => e.cause === 'thermal')),
        mode
      );
      assert.ok(
        fleet(f)
          .filter(v => !v.crashed)
          .every(v => [...v.thermal.values()].every(s => !s.failed)),
        mode
      );
    }
    f.dispose();
  }
});

test('Nominal shallow entry lands intact without requiring ablation below its onset temperature', () => {
  const f = new Flight(preset('reentry'), 'entry');
  try {
    f.armParachutes();
    let max = 0;
    for (let i = 0; i < 1000 * 120 && !f.crashed && !f.landed; i++) {
      f.step(1 / 120);
      max = Math.max(max, ...[...f.thermal.values()].map(s => s.temperature));
    }
    assert.ok(f.landed);
    assert.equal(f.crashed, false);
    assert.ok(max > 288.15);
    const shield = f.parts.find(p => p.type === 'heatShield');
    assert.ok(f.thermal.get(shield.id).ablator > 0 && f.thermal.get(shield.id).ablator <= 40);
  } finally {
    f.dispose();
  }
});

test('Thermal geometry follows each Rapier world through separation, memory growth and disposal', () => {
  const f = new Flight(preset('returner'), 'orbit');
  let restored;
  try {
    f.step(1 / 120);
    assert.equal(f.world.exports.thermal_part_count(), f.parts.length);
    while (f.stage < 2) f.stageNext();
    f.step(1 / 120);
    for (const vessel of fleet(f))
      assert.equal(vessel.world.exports.thermal_part_count(), vessel.parts.length);
    restored = loadFlight(saveFlight(f));
    const shield = f.parts.find(p => p.type === 'heatShield');
    const original = {...f.thermal.get(shield.id)};
    restored.thermal.get(shield.id).temperature = 720;
    restored.step(1 / 120);
    restored.world.exports.memory.grow(1);
    restored.step(1 / 120);
    assert.deepEqual(f.thermal.get(shield.id), original);
    assert.ok(restored.thermal.get(shield.id).temperature < 720);
    const worlds = fleet(restored).map(v => v.world);
    restored.dispose();
    restored = undefined;
    assert.ok(worlds.every(w => w.exports.thermal_part_count() === 0));
    f.step(1 / 120);
    assert.ok(fleet(f).every(v => v.world.exports.thermal_part_count() === v.parts.length));
  } finally {
    restored?.dispose();
    f.dispose();
  }
});
