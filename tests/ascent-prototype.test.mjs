import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {Flight} from '../dist/core.js';
import {preset, PARTS} from '../dist/catalog.js';
import {AscentPrototype} from '../tools/ascent-prototype.mjs';

for (const kind of ['launcher', 'atlas'])
  for (const altitude of [90000, 120000, 200000])
    test(`${kind} reaches requested ${altitude / 1000} km orbit through real actuators`, () => {
      const f = new Flight(preset(kind), 'land'),
        pilot = new AscentPrototype({altitude});
      try {
        for (let i = 0; i < 1200 * 120 && !pilot.done && !f.crashed; i++) {
          pilot.update(f);
          f.step(1 / 120);
        }
        assert.equal(pilot.phase, '周回達成');
        assert.equal(pilot.done, true);
        assert.equal(f.crashed, false);
        assert.ok(f.orbit.periapsis >= altitude - 2000);
        assert.ok(f.orbit.apoapsis <= altitude + 2000);
        assert.equal(f.throttle, 0);
        assert.ok(f.fuelRatio > 0);
        const fuel = [...f.fuel];
        for (let i = 0; i < 60 * 120; i++) f.step(1 / 120);
        assert.deepEqual([...f.fuel], fuel);
        assert.ok(f.orbit.periapsis >= altitude - 2100);
        assert.ok(f.orbit.apoapsis <= altitude + 2100);
      } finally {
        f.dispose();
      }
    });
test('renumbered stages with empty slots still ignite and separate in sequence', () => {
  const parts = preset('launcher');
  for (const p of parts) if (PARTS[p.type].thrust || PARTS[p.type].decoupler) p.stage = p.stage === 0 ? 2 : 5;
  const f = new Flight(parts, 'land'),
    pilot = new AscentPrototype({altitude: 120000});
  try {
    for (let i = 0; i < 900 * 120 && !pilot.done && !f.crashed; i++) {
      pilot.update(f);
      f.step(1 / 120);
    }
    assert.equal(pilot.phase, '周回達成');
    assert.equal(f.stage, 5);
    assert.equal(f.parts.length, 4);
    assert.ok(f.orbit.periapsis >= 118000);
    assert.ok(f.orbit.apoapsis <= 122000);
  } finally {
    f.dispose();
  }
});
test('invalid targets and exhausted stages cannot be reported as requested orbit', () => {
  for (const altitude of [NaN, 70000, Infinity, 600000]) assert.throws(() => new AscentPrototype({altitude}));
  const f = new Flight(preset('launcher'), 'land'),
    pilot = new AscentPrototype({altitude: 120000});
  try {
    for (const id of f.fuel.keys()) f.fuel.set(id, 0);
    for (let i = 0; i < 10 && !pilot.done; i++) pilot.update(f);
    assert.equal(pilot.done, true);
    assert.equal(pilot.phase, '燃料切れ');
    assert.equal(f.throttle, 0);
    assert.match(pilot.completionMessage, /未達/);
  } finally {
    f.dispose();
  }
});

test('guidance follows the surviving thrust axis and cuts throttle when active engines cancel', () => {
  const parts = preset('hopper'),
    engine = parts.find(p => PARTS[p.type].thrust && p.stage === 0),
    reverse = {...structuredClone(engine), id: 'opposed', r: [0, 0, Math.PI / 2]};
  engine.r = [0, 0, -Math.PI / 2];
  parts.push(reverse);
  const f = new Flight(parts, 'land'),
    pilot = new AscentPrototype();
  try {
    f.stageNext();
    f.active.delete(reverse.id);
    pilot.update(f);
    assert.ok(new Vector3(1, 0, 0).applyQuaternion(f.holdQ).y > 0.999);
    f.active.add(reverse.id);
    pilot.update(f);
    assert.ok(pilot.done);
    assert.equal(f.throttle, 0);
    assert.match(pilot.completionMessage, /合計推力/);
  } finally {
    f.dispose();
  }
});
