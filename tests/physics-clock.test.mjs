import * as T from 'three';
import {MOON, bodyState, bodyOrbitState} from '../dist/celestial.js';
import {descentTelemetry} from '../dist/descent.js';
import {surfaceRelativeVelocity} from '../dist/surface-frame.js';
const surfaceSpeed = f =>
  surfaceRelativeVelocity(
    f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),
    f.vel,
    f.universalTime
  ).length();
import test from 'node:test';
import assert from 'node:assert/strict';
import {PhysicsClock, physicalWarpStop} from '../dist/physics-clock.js';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';

test('Physical acceleration preserves every fixed integration step', () => {
  const run = rate => {
    const clock = new PhysicsClock();
    let t = 0,
      x = 0,
      v = 0,
      calls = 0;
    for (let frame = 0; frame < 600 / rate; frame++)
      clock.advance(1 / 60, rate, dt => {
        assert.equal(dt, 1 / 120);
        v += 3 * dt;
        x += v * dt;
        t += dt;
        calls++;
      });
    return {t, x, v, calls};
  };
  assert.deepEqual(run(2), run(1));
  assert.deepEqual(run(4), run(1));
});

test('Overload slows simulated time without skipping or accumulating catch-up', () => {
  const clock = new PhysicsClock({maxSteps: 8});
  let time = 0;
  const result = clock.advance(0.1, 4, dt => {
    time += dt;
  });
  assert.equal(result.steps, 8);
  assert.equal(result.limited, true);
  assert.ok(result.effectiveRate < 4);
  assert.ok(Math.abs(time - 8 / 120) < 1e-12);
  const next = clock.advance(1 / 60, 1, dt => {
    time += dt;
  });
  assert.ok(next.steps <= 3);
  assert.equal(next.limited, false);
});

test('Boundary callback stops the batch and reset clears fractional time', () => {
  const clock = new PhysicsClock();
  let calls = 0;
  assert.equal(
    clock.advance(0.1, 4, () => {
      calls++;
      return false;
    }).steps,
    1
  );
  assert.equal(calls, 1);
  clock.reset();
  assert.equal(
    clock.advance(1 / 240, 1, () => {
      calls++;
    }).steps,
    0
  );
  clock.reset();
  assert.equal(
    clock.advance(1 / 240, 1, () => {
      calls++;
    }).steps,
    0
  );
});

test('Invalid timing cannot poison the next physics frame', () => {
  const clock = new PhysicsClock();
  for (const elapsed of [NaN, Infinity, -1]) assert.throws(() => clock.advance(elapsed, 1, () => {}));
  for (const rate of [NaN, Infinity, 0]) assert.throws(() => clock.advance(0.01, rate, () => {}));
  assert.throws(() => clock.advance(Number.MAX_VALUE, 4, () => {}));
  assert.equal(clock.advance(1 / 60, 1, () => {}).steps, 2);
});

test('Manual burn deadlines, input, damage and touchdown stop physical acceleration', () => {
  const f = {universalTime: 100, maneuver: {universalTime: 160, complete: false}};
  assert.match(physicalWarpStop(f), /予定噴射/);
  f.maneuver.complete = true;
  assert.equal(physicalWarpStop(f), '');
  assert.match(physicalWarpStop(f, true), /操縦/);
  assert.match(physicalWarpStop({...f, landed: true}), /着地/);
  assert.match(physicalWarpStop({...f, crashed: true}), /損傷/);
  assert.match(physicalWarpStop({...f, transferGuide: {firstBurnTime: null, startTime: 115}}), /月遷移/);
});

test('Real launch, entry and parachute physics are identical across frame acceleration', () => {
  for (const environment of ['land', 'entry', 'drop']) {
    const parts = preset(environment === 'land' ? 'lunar-expedition' : 'recovery');
    const seed = new Flight(parts, environment),
      initial = saveFlight(seed);
    seed.dispose();
    const run = rate => {
      const f = loadFlight(initial),
        clock = new PhysicsClock();
      try {
        if (environment === 'land') {
          f.stageNext();
          f.throttle = 1;
        } else f.armParachutes();
        for (let frame = 0; frame < 1200 / rate; frame++)
          clock.advance(1 / 60, rate, dt => {
            f.step(dt);
          });
        return saveFlight(f);
      } finally {
        f.dispose();
      }
    };
    const normal = run(1);
    assert.deepEqual(run(2), normal, environment + ' at 2x');
    assert.deepEqual(run(4), normal, environment + ' at 4x');
  }
});

test('Accelerated parachute descent reaches exactly the same touchdown and fleet epoch', () => {
  const parts = preset('recovery');
  const seed = new Flight(parts, 'drop', 12345),
    initial = saveFlight(seed);
  seed.dispose();
  const run = rate => {
    const f = loadFlight(initial),
      clock = new PhysicsClock();
    try {
      f.armParachutes();
      let frames = 0;
      while (!f.landed && !f.crashed && frames++ < 12000)
        clock.advance(1 / 60, rate, dt => {
          f.step(dt);
          return !physicalWarpStop(f);
        });
      assert.ok(f.landed);
      assert.equal(f.crashed, false);
      assert.ok(surfaceSpeed(f) < 1);
      return saveFlight(f);
    } finally {
      f.dispose();
    }
  };
  const normal = run(1);
  assert.deepEqual(run(2), normal);
  assert.deepEqual(run(4), normal);
});

test('Four-times lunar freefall yields before braking altitude, leaving time for manual ignition', () => {
  const f = new Flight(preset('lander'), 'moon-orbit', 40000),
    clock = new PhysicsClock();
  try {
    const moon = bodyState(MOON, f.universalTime);
    f.q.identity();
    f.pos.copy(moon.position).add(new T.Vector3(0, MOON.radius + 15000, 0));
    f.vel.copy(moon.velocity);
    f.sasMode = 'radial';
    f.stageNext();
    f.throttle = 0;
    let reason = '';
    for (let frame = 0; frame < 10000 && !reason; frame++)
      clock.advance(1 / 60, 4, dt => {
        f.step(dt);
        reason = physicalWarpStop(f);
        return !reason;
      });
    assert.equal(reason, '月面降下の減速準備');
    const d = descentTelemetry(f);
    assert.ok(d.clearance > 4000 && d.clearance < 15000);
    assert.ok(d.clearance > d.brakingDistance + 10 * Math.abs(d.vertical));
    assert.equal(f.throttle, 0, 'guard must not ignite the engine');
    for (let i = 0; i < 1200; i++) f.step(1 / 120);
    f.throttle = 1;
    for (let i = 0; i < 12000 && f.orbit.vertical < 0 && !f.crashed; i++) f.step(1 / 120);
    assert.equal(f.crashed, false);
    assert.ok(descentTelemetry(f).clearance > 1000);
  } finally {
    f.dispose();
  }
});

test('Lunar warp guard preserves orbit and ascent while protecting unpowered and sideways descents', () => {
  const f = new Flight(preset('lander'), 'moon-orbit', 40000);
  try {
    const moon = bodyState(MOON, f.universalTime);
    const state = (height, vertical, horizontal) => {
      f.q.identity();
      f.pos.copy(moon.position).add(new T.Vector3(0, MOON.radius + height, 0));
      f.vel.copy(moon.velocity).add(new T.Vector3(0, vertical, horizontal));
      f.orbit = bodyOrbitState(f.pos.clone().add(f.stats.com), f.vel, f.universalTime);
    };
    assert.equal(physicalWarpStop(f), '');
    state(5000, 30, 0);
    assert.equal(physicalWarpStop(f), '');
    state(3000, -200, 0);
    assert.equal(
      physicalWarpStop(f),
      '月面降下の減速準備',
      'unlit engine cannot be treated as usable braking thrust'
    );
    f.stageNext();
    state(7000, -30, 500);
    assert.equal(physicalWarpStop(f), '月面降下の減速準備', 'horizontal speed also needs braking');
    state(30000, -30, 500);
    assert.equal(physicalWarpStop(f), '');
  } finally {
    f.dispose();
  }
});
