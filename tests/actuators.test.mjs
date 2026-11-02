import {Vector3} from 'three';
import {
  inertialToFixed,
  surfaceAngularVelocity,
  surfaceOrientation,
  surfaceRelativeVelocity
} from '../dist/surface-frame.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight, validateCraft} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
const run = (f, n, input) => {
  for (let i = 0; i < n; i++) f.step(1 / 120, input);
};
test('Reaction-wheel switch suppresses pilot and SAS torque without disabling the core', () => {
  for (const enabled of [true, false]) {
    const f = new Flight(preset('rover'), 'land');
    try {
      f.pos.y = 100;
      f.reactionEnabled = enabled;
      f.stageNext();
      run(f, 30, {pitch: 1, roll: 1, drive: 0});
      assert.equal(f.omega.length() > 0.01, enabled);
      if (!enabled) {
        f.holdQ.setFromAxisAngle({x: 1, y: 0, z: 0}, 0.3);
        run(f, 20, {drive: 0});
        assert.ok(f.omega.clone().sub(surfaceAngularVelocity()).length() < 1e-5);
      }
    } finally {
      f.dispose();
    }
  }
});
test('Wheel drive can be enabled, disabled, and reversed independently of steering', () => {
  for (const [enabled, direction] of [
    [true, 1],
    [true, -1],
    [false, 1]
  ]) {
    const f = new Flight(preset('rover'), 'land');
    try {
      f.reactionEnabled = false;
      f.driveEnabled = enabled;
      f.stageNext();
      run(f, 360, {drive: direction});
      assert.ok(
        enabled
          ? inertialToFixed(f.pos, f.universalTime).z * direction > 5
          : Math.abs(inertialToFixed(f.pos, f.universalTime).z) < 0.05
      );
      f.steeringEnabled = false;
      run(f, 1, {yaw: 1, drive: 0});
      assert.ok([...f.wheelMotion.values()].every(x => x.steer === 0));
      f.steeringEnabled = true;
      run(f, 1, {yaw: 1, drive: 0});
      for (const p of f.parts.filter(p => p.type === 'wheel'))
        assert.equal(f.wheelMotion.get(p.id).steer > 0, p.steeringEnabled !== false);
    } finally {
      f.dispose();
    }
  }
});
test('Per-part actuator settings survive JSON and override global enabled switches', () => {
  const ps = preset('rover');
  for (const p of ps) {
    p.reactionEnabled = false;
    p.steeringEnabled = false;
    p.driveEnabled = false;
  }
  const restored = validateCraft(JSON.parse(JSON.stringify({version: 1, parts: ps})));
  assert.deepEqual(restored, ps);
  const f = new Flight(restored, 'land');
  try {
    f.stageNext();
    run(f, 240, {pitch: 1, yaw: 1, roll: 1, drive: 1});
    assert.ok(Math.abs(inertialToFixed(f.pos, f.universalTime).z) < 0.05);
    assert.ok(f.omega.length() < 0.01);
    assert.ok([...f.wheelMotion.values()].every(x => x.steer === 0));
  } finally {
    f.dispose();
  }
});

test('Nomad turns left and right on wheel forces alone and stops under braking', () => {
  for (const yaw of [-1, 1]) {
    const f = new Flight(preset('rover'), 'land');
    try {
      f.reactionEnabled = false;
      f.stageNext();
      run(f, 360, {drive: 1});
      run(f, 480, {drive: 1, yaw});
      const forward = new Vector3(0, 0, 1)
        .applyQuaternion(f.q)
        .applyQuaternion(surfaceOrientation(f.universalTime).invert());
      assert.ok(forward.x * yaw > 0.2, 'steering must turn the chassis, not just translate it sideways');
      assert.ok(Math.abs(forward.y) < 0.1);
      assert.equal(f.crashed, false);
      assert.equal(f.telemetry.contacts, 4);
      f.brake = true;
      run(f, 480, {drive: 0});
      assert.ok(surfaceRelativeVelocity(f.pos, f.vel, f.universalTime).length() < 0.1);
      assert.equal(f.telemetry.contacts, 4, 'braking must settle on all four wheels');
    } finally {
      f.dispose();
    }
  }
});
