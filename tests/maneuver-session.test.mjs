import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {maneuverPreview} from '../dist/maneuver.js';
import {createManeuverNode} from '../dist/maneuver-node.js';
import {ManeuverSession} from '../dist/maneuver-session.js';
import {maneuverExecutionPlan, maneuverExecutionThrottle} from '../dist/maneuver-execution-plan.js';
import {terminalBurnDuration} from '../dist/maneuver-thrust-profile.js';

function vessel(dv = 30) {
  const f = new Flight(preset('rocket'), 'orbit');
  f.stageNext();
  const p = maneuverPreview(
    f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),
    f.vel,
    {universalTime: 90},
    dv,
    f.universalTime
  );
  f.maneuver = createManeuverNode(p, f.time);
  return f;
}
test('ordinary center and start times differ, already timed nodes are never shifted twice', () => {
  const n = {universalTime: 100, complete: false};
  assert.deepEqual(maneuverExecutionPlan(n, 0, 4), {
    startTime: 80,
    duration: 40,
    throttle: 0.1,
    timing: 'center'
  });
  assert.equal(maneuverExecutionPlan(n, 0, 4, {timing: 'start'}).startTime, 100);
  for (const property of ['capture', 'returnPlan', 'departure']) {
    const fixed = {...n, [property]: {}};
    assert.equal(maneuverExecutionPlan(fixed, 0, 4).startTime, 100);
    assert.throws(() => maneuverExecutionPlan(fixed, 0, 4, {throttle: 0.1}), /計画推力/);
  }
  const finite = {...n, plannedThrottle: 0.1};
  assert.equal(maneuverExecutionPlan(finite, 0, 4).startTime, 100);
  assert.throws(() => maneuverExecutionPlan(n, 85, 4), /過去/);
  assert.throws(() => maneuverExecutionPlan(n, 0, 4, {throttle: 0}));
});
test('predicted lunar tail power differs from constant-power finite return and capture', () => {
  for (const node of [{returnPlan: {}}, {departure: {}}]) {
    for (const [left, power] of [
      [11, 1],
      [10, 1],
      [9, 0.1],
      [2, 0.1],
      [1, 0.01]
    ])
      assert.equal(maneuverExecutionThrottle(node, {throttle: 1}, left), power);
  }
  assert.equal(maneuverExecutionThrottle({capture: {}}, {throttle: 1}, 1), 1);
  assert.equal(maneuverExecutionThrottle({plannedThrottle: 0.1}, {throttle: 0.1}, 1), 0.1);
});
test('terminal duration counts slow tails and plans shorter than either transition', () => {
  assert.ok(Math.abs(terminalBurnDuration(100, dv => dv / 10) - 32) < 1e-10);
  assert.ok(Math.abs(terminalBurnDuration(5, dv => dv / 10) - 18) < 1e-10);
  assert.ok(Math.abs(terminalBurnDuration(1, dv => dv / 10) - 5) < 1e-10);
  assert.ok(Math.abs(terminalBurnDuration(100, dv => dv / 10, 0.05) - 36.5) < 1e-10);
  assert.throws(() => terminalBurnDuration(0, dv => dv));
  assert.throws(() => terminalBurnDuration(100, () => NaN));
});
for (const [name, dv, throttle] of [
  ['prograde', 30, 0.1],
  ['retrograde', -30, 0.1],
  ['normal', {prograde: 0, normal: 30, radial: 0}, 1]
])
  test(`real ${name} burn aligns, waits, consumes fuel and cuts off`, () => {
    const f = vessel(dv),
      s = new ManeuverSession();
    try {
      const initialFuel = [...f.fuel];
      s.start(f, {throttle});
      let first = null;
      for (let i = 0; i < 300 * 120 && s.owner; i++) {
        const pos = f.pos.clone(),
          vel = f.vel.clone(),
          q = f.q.clone();
        s.step(f, 1 / 120);
        assert.deepEqual(f.pos, pos);
        assert.deepEqual(f.vel, vel);
        assert.deepEqual(f.q, q);
        if (f.throttle > 0 && first === null) first = f.universalTime;
        if (f.universalTime < s.plan.startTime) {
          assert.equal(f.throttle, 0);
          assert.deepEqual([...f.fuel], initialFuel);
        }
        f.step(1 / 120);
      }
      assert.equal(s.state, 'complete', s.message);
      assert.ok(first >= s.plan.startTime && first <= s.plan.startTime + 2);
      assert.equal(f.throttle, 0);
      assert.equal(f.maneuver.complete, true);
      assert.ok(f.fuelRatio < 1);
      assert.ok(new T.Vector3(...f.maneuver.remaining).length() < 0.5);
      const fuel = [...f.fuel];
      for (let i = 0; i < 120; i++) f.step(1 / 120);
      assert.deepEqual([...f.fuel], fuel);
    } finally {
      f.dispose();
    }
  });
test('pause, stop, replacement, plan edits and fuel shortage release or refuse ownership', () => {
  const f = vessel(),
    other = vessel(),
    s = new ManeuverSession();
  try {
    s.start(f);
    const before = {sas: f.sas, sasMode: f.sasMode, throttle: f.throttle};
    s.step(f, 0);
    assert.deepEqual({sas: f.sas, sasMode: f.sasMode, throttle: f.throttle}, before);
    s.step(f, 1 / 120);
    s.stop();
    assert.equal(f.throttle, 0);
    assert.equal(f.sasMode, before.sasMode);
    s.start(f);
    other.throttle = 0.4;
    s.step(other, 1 / 120);
    assert.equal(s.state, 'cancelled');
    assert.equal(other.throttle, 0.4);
    s.start(f);
    f.maneuver.universalTime += 1;
    s.step(f, 1 / 120);
    assert.equal(s.state, 'cancelled');
    for (const id of f.fuel.keys()) f.fuel.set(id, 0);
    assert.throws(() => s.start(f), /燃料/);
    assert.equal(s.owner, null);
  } finally {
    f.dispose();
    other.dispose();
  }
});
test('without attitude actuators, a missed alignment deadline never ignites', () => {
  const f = vessel(-30),
    s = new ManeuverSession();
  try {
    f.reactionEnabled = false;
    const fuel = [...f.fuel];
    s.start(f);
    for (let i = 0; i < 100 * 120 && s.owner; i++) {
      s.step(f, 1 / 120);
      f.step(1 / 120);
    }
    assert.equal(s.state, 'failed');
    assert.match(s.message, /姿勢/);
    assert.equal(f.throttle, 0);
    assert.deepEqual([...f.fuel], fuel);
  } finally {
    f.dispose();
  }
});
test('in-flight fuel loss and a new plan stop before another engine command', () => {
  const f = vessel(),
    s = new ManeuverSession();
  try {
    s.start(f);
    for (let i = 0; i < 120 * 120 && s.state !== 'burning' && s.owner; i++) {
      s.step(f, 1 / 120);
      f.step(1 / 120);
    }
    assert.equal(s.state, 'burning');
    for (const id of f.fuel.keys()) f.fuel.set(id, 0);
    s.step(f, 1 / 120);
    assert.equal(s.state, 'failed');
    assert.match(s.message, /燃料切れ/);
    assert.equal(f.throttle, 0);
  } finally {
    f.dispose();
  }
  const g = vessel(),
    t = new ManeuverSession();
  try {
    t.start(g);
    g.maneuver = structuredClone(g.maneuver);
    t.step(g, 1 / 120);
    assert.equal(t.state, 'cancelled');
    assert.equal(g.throttle, 0);
  } finally {
    g.dispose();
  }
});
