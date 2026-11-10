import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {TakeoffPrototype} from '../dist/takeoff-prototype.js';
import {runwayApproach, RUNWAY} from '../dist/runway-navigation.js';

test('experimental attitude loop retains guidance between samples without changing physical state', () => {
  const f = new Flight(preset('plane'), 'runway', 161700);
  try {
    const p = new TakeoffPrototype(f, {speed: 120, integral: true, handoff: 'attitude'});
    p.cruise = {telemetry: {pitch: 0}};
    const pos = f.pos.clone(),
      velocity = f.vel.clone(),
      pose = f.q.clone();
    f.holdQ = f.q.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), 0.1));
    const first = p.cruiseCommands(f, 1 / 120);
    assert.ok(first.yaw > 0.1);
    f.holdQ = f.q.clone(); // Flight's SAS-off bookkeeping must not erase guidance.
    const second = p.cruiseCommands(f, 1 / 120);
    assert.ok(second.yaw > 0.1);
    assert.deepEqual(f.pos, pos);
    assert.deepEqual(f.vel, velocity);
    assert.deepEqual(f.q, pose);
    p.cruise.telemetry = {pitch: 0};
    f.holdQ = f.q.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), -0.1));
    assert.ok(p.cruiseCommands(f, 1 / 120).yaw < -0.1);
    p.cruise.running = false;
    assert.deepEqual(p.cruiseCommands(f, 1 / 120), {});
    assert.equal(p.phase, 'stopped');
  } finally {
    f.dispose();
  }
});

test('loaded cargo aborts a normal departure and stops before runway end', () => {
  const f = new Flight(preset('transport-cargo'), 'runway', 161700);
  f.stageNext();
  try {
    const p = new TakeoffPrototype(f, {
      speed: 90,
      rotation: 12,
      integral: true,
      handoff: 'attitude',
      abortGuard: true
    });
    let maxAlong = 0,
      maxCross = 0;
    for (let i = 0; i < 60 * 120 && p.phase !== 'stopped' && !f.crashed; i++) {
      f.step(1 / 120, p.update(f, 1 / 120));
      const center = f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),
        r = runwayApproach(center, f.universalTime, '09', f.vel);
      maxAlong = Math.max(maxAlong, -r.remaining);
      maxCross = Math.max(maxCross, Math.abs(r.crossTrack));
    }
    assert.ok(p.abort);
    assert.equal(p.phase, 'stopped');
    assert.equal(f.crashed, false);
    assert.ok(maxAlong < RUNWAY.length, `ground track ${maxAlong}`);
    assert.ok(maxCross < RUNWAY.width / 2);
    assert.ok(f.telemetry.surfaceSpeed < 0.5);
    assert.equal(f.throttle, 0);
    assert.equal(f.brake, true);
    assert.deepEqual(p.update(f, 1 / 120), {});
    assert.equal(f.throttle, 0);
  } finally {
    f.dispose();
  }
});
