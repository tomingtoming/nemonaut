import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Flight} from '../dist/core.js';
import {preset, part} from '../dist/catalog.js';
import {maneuverPreview} from '../dist/maneuver.js';
import {createManeuverNode, validateManeuverNode} from '../dist/maneuver-node.js';
import {ManeuverSession} from '../dist/maneuver-session.js';
import {maneuverExecutionPlan, ALIGNMENT_WINDOW} from '../dist/maneuver-execution-plan.js';
import {WorldRuntime} from '../dist/world-runtime.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';

// A plan fixed for "now": its epoch is already past when the automatic burn starts.
function vessel(onAlignment, dv = 20, craft = preset('rocket')) {
  const f = new Flight(craft, 'orbit');
  f.stageNext();
  const p = maneuverPreview(
    f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),
    f.vel,
    {universalTime: f.universalTime},
    dv,
    f.universalTime
  );
  f.maneuver = createManeuverNode(p, f.time, onAlignment ? {onAlignment: true} : {});
  f.universalTime += 5;
  f.time += 5;
  return f;
}
test('a now-plan is not rejected as past; its start is an alignment deadline', () => {
  const n = {universalTime: 100, complete: false};
  assert.throws(() => maneuverExecutionPlan(n, 130, 4), /過去/, 'ordinary nodes still refuse a past start');
  const plan = maneuverExecutionPlan({...n, onAlignment: true}, 130, 4);
  assert.deepEqual(plan, {
    startTime: 130 + ALIGNMENT_WINDOW,
    duration: 40,
    throttle: 0.1,
    timing: 'start',
    onAlignment: true
  });
});
test('the automatic burn of a now-plan lights once aligned and completes', () => {
  const f = vessel(true),
    runtime = new WorldRuntime(f),
    s = new ManeuverSession();
  try {
    const unmarked = vessel(false);
    try {
      assert.throws(
        () => new ManeuverSession().start(unmarked),
        /過去/,
        'without the mark the same plan is refused'
      );
    } finally {
      unmarked.dispose();
    }
    s.start(f, {throttle: 0.1});
    const deadline = s.plan.startTime;
    let litAt = null;
    for (let i = 0; i < 240 * 120 && s.owner; i++) {
      s.step(f, 1 / 120);
      if (litAt === null && s.state === 'burning') litAt = f.universalTime;
      runtime.replace(f);
      runtime.step(1 / 120, {});
    }
    assert.equal(s.state, 'complete', s.message);
    assert.ok(litAt !== null && litAt < deadline, 'lit before the alignment deadline');
    assert.ok(new T.Vector3(...f.maneuver.remaining).length() < 0.5);
  } finally {
    f.dispose();
  }
});
test('the mark is exclusive with thrust contracts and survives save and load', () => {
  const f = vessel(true);
  try {
    const p = maneuverPreview(
      f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),
      f.vel,
      {universalTime: f.universalTime},
      20,
      f.universalTime
    );
    assert.throws(() => createManeuverNode(p, f.time, {onAlignment: true, plannedThrottle: 0.1}), /推力契約/);
    assert.throws(() => validateManeuverNode({...f.maneuver, onAlignment: 'yes'}), /今すぐ/);
    const g = loadFlight(saveFlight(f));
    assert.equal(g.maneuver.onAlignment, true);
    g.dispose();
  } finally {
    f.dispose();
  }
});

test('automatic burn aligns the engine even when the command pod looks sideways', () => {
  const f = vessel(true),
    session = new ManeuverSession();
  const pod = f.parts.find(p => p.type === 'capsule');
  pod.referenceDirection = 2;
  const runtime = new WorldRuntime(f);
  try {
    session.start(f, {throttle: 0.1});
    let lit = false;
    for (let i = 0; i < 240 * 120 && session.owner; i++) {
      session.step(f, 1 / 120);
      if (!lit && f.throttle > 0) {
        const remaining = new T.Vector3(...f.maneuver.remaining).normalize();
        const thrustAxis = new T.Vector3(0, 1, 0).applyQuaternion(f.q);
        const nose = new T.Vector3(0, 1, 0).applyQuaternion(f.instrumentRotation).applyQuaternion(f.q);
        assert.ok(thrustAxis.angleTo(remaining) < (2 * Math.PI) / 180);
        assert.ok(Math.abs(nose.dot(remaining)) < 0.04);
        lit = true;
      }
      runtime.replace(f);
      runtime.step(1 / 120, {});
    }
    assert.ok(lit);
    assert.equal(session.state, 'complete', session.message);
    assert.equal(pod.referenceDirection, 2);
  } finally {
    f.dispose();
  }
});

test('forward controls allow automatic burns with aligned rocket propulsion but reject a tilted engine', () => {
  const craft = preset('rocket');
  craft[0].type = 'probe';
  craft.push(part('cockpit', [0, 2, 0], [Math.PI / 2, Math.PI, 0], craft[0].id));
  const f = vessel(true, 5, craft),
    session = new ManeuverSession(),
    runtime = new WorldRuntime(f);
  try {
    assert.equal(f.rocketAxes, false);
    const engine = f.parts.find(p => p.type === 'engine');
    engine.r[0] = Math.PI / 2;
    assert.throws(() => session.start(f), /推力軸/);
    assert.equal(f.throttle, 0);
    engine.r[0] = 0;
    session.start(f, {throttle: 0.1});
    for (let i = 0; i < 240 * 120 && session.owner; i++) {
      session.step(f, 1 / 120);
      runtime.replace(f);
      runtime.step(1 / 120, {});
    }
    assert.equal(session.state, 'complete', session.message);
  } finally {
    f.dispose();
  }
});
