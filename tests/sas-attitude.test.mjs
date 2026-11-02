import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {manualAttitudeTarget} from '../dist/sas-attitude.js';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {bodyUp} from '../dist/celestial.js';

test('manual attitude releases commanded body axes in any world orientation', () => {
  for (const rotation of [new T.Euler(), new T.Euler(0.8, -1.2, 2.1)]) {
    const q = new T.Quaternion().setFromEuler(rotation);
    for (const axis of ['x', 'y', 'z']) {
      const error = new T.Quaternion().setFromEuler(new T.Euler(0.2, -0.3, 0.4)),
        target = q.clone().multiply(error);
      const input = new T.Vector3();
      input[axis] = 1;
      const held = manualAttitudeTarget(q, target, input),
        local = q.clone().invert().multiply(held);
      assert.ok(Math.abs(local[axis]) < 1e-12);
      const expected = error.clone();
      expected[axis] = 0;
      expected.normalize();
      assert.ok(local.angleTo(expected) < 1e-7);
      assert.ok(target.angleTo(q.clone().multiply(error)) < 1e-7, 'does not mutate target');
    }
    assert.ok(manualAttitudeTarget(q, q.clone(), new T.Vector3(1, 1, 1)).angleTo(q) < 1e-7);
  }
});

test('a short left or right bank retains aircraft pitch support after runway takeoff', () => {
  for (const roll of [-1, 1]) {
    const f = new Flight(preset('plane'), 'runway', 159542);
    try {
      f.throttle = 1;
      f.stageNext();
      let before,
        minPitch = 90,
        rolled = 0;
      for (let i = 0; i < 71 * 120; i++) {
        const t = i / 120;
        f.step(1 / 120, {pitch: t > 10 && t < 28 ? -1 : 0, roll: t >= 65 && t < 65.5 ? roll : 0});
        if (i === 64 * 120) before = f.q.clone();
        if (t >= 66) {
          const forward = new T.Vector3(0, 0, 1).applyQuaternion(f.q),
            up = bodyUp(f.pos, f.universalTime);
          minPitch = Math.min(
            minPitch,
            (Math.asin(T.MathUtils.clamp(forward.dot(up), -1, 1)) * 180) / Math.PI
          );
          rolled = Math.max(rolled, f.q.angleTo(before));
        }
      }
      assert.equal(f.crashed, false);
      assert.ok(minPitch > 15, `pitch ${minPitch}`);
      assert.ok(rolled > 0.1, 'bank input must still rotate aircraft');
      assert.ok(f.orbit.vertical > 10, 'bank must not discard established climb support');
    } finally {
      f.dispose();
    }
  }
});

// A bank pulse is not a complete turn: holding a tilted attitude for a long
// interval eventually saturates yaw authority. Exercise the rollout as well.
test('Swift recovers attitude and climb after a bank and opposite rollout', () => {
  for (const roll of [-1, 1]) {
    const f = new Flight(preset('plane'), 'runway', 159701);
    try {
      f.throttle = 1;
      f.stageNext();
      let maxSettledError = 0,
        minClimb = Infinity;
      for (let i = 0; i < 100 * 120; i++) {
        const t = i / 120;
        f.step(1 / 120, {
          pitch: t >= 10 && t < 26 ? -1 : 0,
          roll: t >= 51 && t < 51.5 ? roll : t >= 57 && t < 57.5 ? -roll : 0
        });
        if (t >= 80) {
          maxSettledError = Math.max(maxSettledError, f.q.angleTo(f.holdQ));
          minClimb = Math.min(minClimb, f.orbit.vertical);
          assert.equal(f.telemetry.stallCount, 0);
          assert.ok(Math.abs(f.telemetry.commands.yaw) < 0.9, 'rudder regains control margin');
        }
      }
      assert.equal(f.crashed, false);
      assert.ok(maxSettledError < (3 * Math.PI) / 180, `settled error ${(maxSettledError * 180) / Math.PI}`);
      assert.ok(minClimb > 10, `climb ${minClimb}`);
    } finally {
      f.dispose();
    }
  }
});

test('large aircraft can hold a banked turn and recover without fighting its original heading', () => {
  for (const sign of [-1, 1]) {
    const f = new Flight(preset('plane-large'), 'runway', 160658.7);
    f.stageNext();
    f.throttle = 1;
    try {
      for (let i = 0; i < 150 * 120; i++) {
        const t = i / 120;
        const pitch =
          t >= 33.6 && t < 41.6
            ? -1
            : t >= 41.6 && t < 43.6
              ? 1
              : t >= 43.6 && t < 44.3
                ? -1
                : t >= 67.8 && t < 68.15
                  ? -1
                  : t >= 84 && t < 84.3
                    ? -1
                    : 0;
        const roll =
          sign *
          (t >= 44.3 && t < 45.5
            ? 1
            : t >= 65.5 && t < 66.2
              ? -1
              : t >= 67.45 && t < 67.8
                ? -1
                : t >= 83.8 && t < 84
                  ? -1
                  : 0);
        f.step(1 / 120, {pitch, roll});
        if (t > 110) {
          assert.ok(f.orbit.vertical > 10, `climb ${f.orbit.vertical}`);
          assert.ok(f.q.angleTo(f.holdQ) < (2 * Math.PI) / 180);
          assert.ok(Math.abs(f.telemetry.commands.yaw) < 0.2);
          assert.equal(f.telemetry.stallCount, 0);
        }
      }
      assert.equal(f.crashed, false);
      assert.ok(f.orbit.altitude > 1000);
    } finally {
      f.dispose();
    }
  }
});

test('bank heading transport preserves target pitch and roll relative to local vertical', async () => {
  const {followBankHeading} = await import('../dist/sas-attitude.js');
  for (const up of [new T.Vector3(0, 1, 0), new T.Vector3(1, 2, -3).normalize()]) {
    const local = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), up);
    const target = local.clone().multiply(new T.Quaternion().setFromEuler(new T.Euler(-0.2, 0, 0.4)));
    const current = new T.Quaternion().setFromAxisAngle(up, 0.8).multiply(target);
    const result = followBankHeading(current, target, up);
    assert.ok(result.angleTo(current) < 1e-7);
    for (const axis of [new T.Vector3(1, 0, 0), new T.Vector3(0, 0, 1)])
      assert.ok(
        Math.abs(
          axis.clone().applyQuaternion(result).dot(up) - axis.clone().applyQuaternion(target).dot(up)
        ) < 1e-9
      );
  }
});
