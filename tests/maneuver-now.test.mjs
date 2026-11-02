import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {maneuverPreview} from '../dist/maneuver.js';
import {createManeuverNode, validateManeuverNode} from '../dist/maneuver-node.js';
import {ManeuverSession} from '../tools/maneuver-session.mjs';
import {maneuverExecutionPlan, ALIGNMENT_WINDOW} from '../tools/maneuver-execution-plan.mjs';
import {WorldRuntime} from '../dist/world-runtime.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';

// A plan fixed for "now": its epoch is already past when the automatic burn starts.
function vessel(onAlignment, dv = 20) {
  const f = new Flight(preset('rocket'), 'orbit');
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
    assert.throws(
      () => new ManeuverSession().start(vessel(false)),
      /過去/,
      'without the mark the same plan is refused'
    );
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
