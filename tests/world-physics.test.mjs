import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import {fleet, selectVessel} from '../dist/fleet.js';
import {setTarget} from '../dist/relative-navigation.js';
import {advanceWorldPhysics} from '../dist/world-physics.js';

test('Changing the controlled vessel does not change mutual target guidance or fleet motion without input', () => {
  const a = new Flight(preset('orbiter'), 'orbit'),
    b = new Flight(preset('orbiter'), 'orbit');
  a.detached.push(b);
  b.pos.x += 30;
  b.vel.x += 8;
  setTarget(a, a, b);
  setTarget(a, b, a);
  a.sasMode = b.sasMode = 'target';
  let copy, left;
  try {
    const saved = saveFlight(a);
    left = loadFlight(saved);
    copy = loadFlight(saved);
    copy = selectVessel(copy, copy.detached[0]);
    for (let i = 0; i < 120; i++) {
      left.step(1 / 120);
      copy.step(1 / 120);
    }
    const byId = new Map(fleet(copy).map(v => [v.vesselId, v]));
    for (const v of fleet(left)) {
      const other = byId.get(v.vesselId);
      assert.equal(v.universalTime, other.universalTime);
      assert.ok(v.pos.distanceTo(other.pos) < 1e-9, 'same position');
      assert.ok(v.omega.distanceTo(other.omega) < 1e-9, 'same attitude-control response');
      assert.ok(v.q.angleTo(other.q) < 1e-7, 'same attitude');
      assert.deepEqual([...v.charge], [...other.charge]);
    }
  } finally {
    a.dispose();
    left?.dispose();
    copy?.dispose();
  }
});

test('Flat world stepping routes input by vessel ID and rejects divergent clocks before updating', () => {
  const a = new Flight(preset('orbiter'), 'orbit'),
    b = new Flight(preset('orbiter'), 'orbit');
  try {
    const calls = [];
    a.stepBody = (dt, input) => calls.push([a.vesselId, dt, input]);
    b.stepBody = (dt, input) => calls.push([b.vesselId, dt, input]);
    const command = {pitch: 1};
    assert.equal(advanceWorldPhysics([b, a], 0, 0.1, a.vesselId, command), 0.1);
    assert.deepEqual(calls, [
      [b.vesselId, 0.1, {}],
      [a.vesselId, 0.1, command]
    ]);
    assert.equal(a.universalTime, b.universalTime);
    b.universalTime = 0.2;
    calls.length = 0;
    assert.throws(() => advanceWorldPhysics([a, b], 0.1, 0.1, a.vesselId));
    assert.deepEqual(calls, []);
    assert.equal(a.universalTime, 0.1);
    assert.equal(b.universalTime, 0.2);
    b.universalTime = 0.1;
    assert.throws(() => advanceWorldPhysics([a, a], 0.1, 0.1, a.vesselId));
    assert.throws(() => advanceWorldPhysics([a, b], 0.1, 0.1, 'missing'));
    assert.throws(() => advanceWorldPhysics([a, b], 0.1, NaN, a.vesselId));
    assert.deepEqual(calls, []);
  } finally {
    a.dispose();
    b.dispose();
  }
});
