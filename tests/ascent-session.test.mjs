import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';
import {preset, PARTS} from '../dist/catalog.js';
import {PRIMARY_ROTATION_PERIOD} from '../dist/surface-frame.js';
import {AscentSession} from '../dist/ascent-session.js';
test('pause, manual cancellation and vessel replacement do not leak ascent commands', () => {
  const a = new Flight(preset('launcher'), 'land'),
    b = new Flight(preset('atlas'), 'land'),
    s = new AscentSession();
  try {
    a.sas = false;
    const before = {pos: a.pos.clone(), vel: a.vel.clone(), stage: a.stage};
    s.start(a, {altitude: 120000});
    s.step(a, 0);
    assert.deepEqual(a.pos, before.pos);
    assert.deepEqual(a.vel, before.vel);
    assert.equal(a.stage, before.stage);
    s.step(a, 1 / 120);
    assert.equal(a.navigationFrame, 'orbit');
    s.stop();
    assert.equal(a.sas, false);
    assert.equal(a.navigationAuto, true);
    assert.equal(a.throttle, 0);
    const stage = a.stage;
    s.step(a, 1);
    assert.equal(a.stage, stage);
    s.start(a, {altitude: 120000});
    s.step(a, 1 / 120);
    b.throttle = 0.31;
    const q = b.holdQ.clone();
    s.step(b, 1 / 120);
    assert.equal(s.state, 'cancelled');
    assert.equal(b.throttle, 0.31);
    assert.deepEqual(b.holdQ, q);
    assert.equal(b.stage, -1);
    assert.equal(a.throttle, 0);
  } finally {
    a.dispose();
    b.dispose();
  }
});
test('loss of control and final fuel exhaustion release ownership as failure', () => {
  const f = new Flight(preset('launcher'), 'land'),
    s = new AscentSession();
  try {
    s.start(f, {altitude: 120000});
    f.crashed = true;
    s.step(f, 1 / 120);
    assert.equal(s.state, 'failed');
    assert.equal(f.throttle, 0);
    f.crashed = false;
    s.start(f, {altitude: 120000});
    for (const id of f.fuel.keys()) f.fuel.set(id, 0);
    for (let i = 0; i < 10 && s.owner; i++) s.step(f, 1 / 120);
    assert.equal(s.state, 'failed');
    assert.match(s.message, /未達/);
    assert.equal(s.owner, null);
  } finally {
    f.dispose();
  }
});
for (const [kind, epoch, limit] of [
  ['launcher', PRIMARY_ROTATION_PERIOD / 4, 1],
  ['launcher', 0, 0.8]
])
  test(`ascent ownership completes ${kind} at epoch ${epoch} with thrust ${limit}`, () => {
    const parts = preset(kind);
    for (const p of parts) if (PARTS[p.type].thrust) p.thrustLimit = limit;
    const f = new Flight(parts, 'land', epoch),
      s = new AscentSession();
    try {
      f.sas = false;
      f.navigationFrame = 'surface';
      s.start(f, {altitude: 120000});
      for (let i = 0; i < 1201 * 120 && s.owner; i++) {
        s.step(f, 1 / 120);
        if (!s.owner) {
          assert.equal(f.navigationFrame, 'surface');
          assert.equal(f.navigationAuto, true);
        }
        f.step(1 / 120);
      }
      assert.equal(s.state, 'complete');
      assert.equal(s.owner, null);
      assert.equal(s.pilot, null);
      assert.equal(f.crashed, false);
      assert.ok(f.orbit.periapsis >= 118000);
      assert.ok(f.orbit.apoapsis <= 122000);
      // Restored automatic selection then legitimately follows the orbital flight state.
      assert.equal(f.sas, false);
      assert.equal(f.navigationAuto, true);
      assert.equal(f.navigationFrame, 'orbit');
      assert.equal(f.throttle, 0);
    } finally {
      f.dispose();
    }
  });
test('timeout releases control as a failure rather than claiming orbit', () => {
  const f = new Flight(preset('launcher'), 'land'),
    s = new AscentSession();
  try {
    s.start(f, {altitude: 120000});
    s.elapsed = 1200;
    s.step(f, 1 / 120);
    assert.equal(s.state, 'failed');
    assert.equal(s.owner, null);
    assert.equal(f.stage, -1);
    assert.equal(f.throttle, 0);
  } finally {
    f.dispose();
  }
});
