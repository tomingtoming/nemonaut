import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {WorldRuntime} from '../dist/world-runtime.js';
import {fleet} from '../dist/fleet.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import {bodyState, referenceBody} from '../dist/celestial.js';
import {inertialToFixed, surfaceRelativeVelocity} from '../dist/surface-frame.js';

// A braked tyre that has stopped grips the ground up to the grip limit (0.8 of its load) and lets go
// above it; a tyre that rolls or slides is braked and steered by its speed alone.
const dt = 1 / 120;
// Keeps the step's result (a braked vessel with no input and no SAS is held to the surface instead).
const awake = {translateX: 1};
const place = f => inertialToFixed(f.pos, f.universalTime),
  /** A craft axis as a direction on the rotating surface. */
  surfaceAxis = (f, x, y, z) => {
    const body = referenceBody(f.pos, f.universalTime);
    return inertialToFixed(
      new T.Vector3(x, y, z).applyQuaternion(f.q).add(bodyState(body, f.universalTime).position),
      f.universalTime,
      body
    );
  },
  speed = f =>
    surfaceRelativeVelocity(
      f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),
      f.vel,
      f.universalTime
    ).length(),
  gripped = f => [...f.wheelMotion.values()].filter(m => m.anchor).length,
  wheels = f => f.wheelMotion.size;
/** An aircraft standing on the runway with its brakes on, stepped until its tyres grip. */
function standing(kind = 'plane', fuel = 1) {
  const f = new Flight(preset(kind), 'runway');
  f.sas = false;
  f.fuelRatio = fuel;
  for (let i = 0; i < 600; i++) f.step(dt, awake);
  assert.equal(f.brake, true);
  assert.equal(gripped(f), wheels(f), 'every tyre grips');
  return f;
}
/** Steps the craft and returns its travel along its nose after each of the given seconds. */
function travel(f, seconds, input = awake) {
  const nose = surfaceAxis(f, 0, 0, 1),
    start = place(f),
    out = [];
  for (let s = 1; s <= seconds.at(-1) * 120; s++) {
    f.step(dt, input);
    if (seconds.includes(s / 120)) out.push({x: place(f).sub(start).dot(nose), v: speed(f)});
  }
  return out;
}

test('releasing the brake lets go of the ground and the aircraft rolls under low thrust', () => {
  const f = standing();
  try {
    f.throttle = 0.1;
    f.stageNext();
    f.brake = false;
    const [one, ten] = travel(f, [1, 10]);
    assert.equal(gripped(f), 0);
    // The roll of an aircraft whose tyres never gripped: 0.2936 m after 1 s, 28.267 m after 10 s.
    assert.ok(Math.abs(one.x - 0.2936) < 1e-3, `after 1 s: ${one.x}`);
    assert.ok(Math.abs(ten.x - 28.267) < 0.01, `after 10 s: ${ten.x}`);
    assert.ok(Math.abs(ten.v - 5.5307) < 1e-3, `speed ${ten.v}`);
  } finally {
    f.dispose();
  }
});

test('braked tyres hold full thrust below the grip limit and slide above it', () => {
  // Thrust over weight is 0.60 with full tanks, 0.85 at half and 1.14 at a fifth; the tyres grip to 0.8.
  const held = standing('plane', 1);
  try {
    held.throttle = 1;
    held.stageNext();
    held.brake = true;
    const [, , end] = travel(held, [2, 4, 8]);
    assert.ok(held.lastThrust > 0);
    assert.ok(end.x > 0 && end.x < 0.1, `held within the tyres' give: ${end.x}`);
    assert.ok(end.v < 1e-3, `at rest: ${end.v}`);
    assert.equal(gripped(held), wheels(held));
  } finally {
    held.dispose();
  }
  for (const [fuel, far, fast] of [
    [0.5, 5, 1.2],
    [0.2, 60, 15]
  ]) {
    const f = standing('plane', fuel);
    try {
      f.throttle = 1;
      f.stageNext();
      f.brake = true;
      const [two, four, eight] = travel(f, [2, 4, 8]);
      assert.ok(
        two.v < four.v && four.v < eight.v,
        `fuel ${fuel} keeps gaining speed: ${two.v} ${four.v} ${eight.v}`
      );
      assert.ok(eight.x > far && eight.v > fast, `fuel ${fuel} dragged ${eight.x} m to ${eight.v} m/s`);
      assert.equal(f.crashed, false);
    } finally {
      f.dispose();
    }
  }
});

test('braking from a roll stops in the same distance and stays there', () => {
  // Distances of the speed-proportional brake alone, which the grip takes over from below 1 cm/s.
  for (const [from, distance] of [
    [1, 0.1333],
    [5, 1.6412],
    [15, 14.1944]
  ]) {
    const f = new Flight(preset('plane'), 'runway');
    try {
      f.sas = false;
      f.throttle = 1;
      f.stageNext();
      for (let i = 0; speed(f) < from; i++) {
        assert.ok(i < 120 * 60);
        f.step(dt, awake);
      }
      f.throttle = 0;
      f.brake = true;
      const nose = surfaceAxis(f, 0, 0, 1),
        start = place(f);
      let furthest = -Infinity,
        stopped = null,
        low = Infinity,
        high = -Infinity;
      for (let s = 0; s < 120 * 12; s++) {
        f.step(dt, awake);
        const x = place(f).sub(start).dot(nose);
        furthest = Math.max(furthest, x);
        if (stopped === null && speed(f) < 1e-3) stopped = s;
        // Two seconds after it stopped the aircraft has also stopped rocking on its gear.
        if (stopped !== null && s > stopped + 240) {
          low = Math.min(low, x);
          high = Math.max(high, x);
        }
      }
      const end = place(f).sub(start).dot(nose),
        report = `from ${from} m/s: furthest ${furthest}, end ${end}, after rest ${low}..${high}`;
      assert.ok(stopped !== null && stopped < 120 * 4, report);
      assert.ok(Math.abs(furthest - distance) < 0.01, report);
      assert.ok(furthest - end < 1e-3, `no rebound: ${report}`);
      assert.ok(high - low < 1e-4, `no oscillation: ${report}`);
      assert.ok(speed(f) < 1e-4, report);
      assert.equal(gripped(f), wheels(f));
    } finally {
      f.dispose();
    }
  }
});

/** A rover behind a standing braked vessel, rolling at it along the given craft axis of the target. */
function rammed(target, axis, gap, closing) {
  const settle = new WorldRuntime(target);
  target.sas = true;
  for (let i = 0; i < 600; i++) settle.step(dt, awake);
  assert.equal(gripped(target), wheels(target));
  const rover = new Flight(preset('rover'), 'runway', target.universalTime),
    direction = axis.clone().applyQuaternion(target.q);
  rover.time = target.time;
  rover.brake = false;
  rover.q.copy(target.q);
  rover.pos.addScaledVector(direction, -gap);
  rover.vel.addScaledVector(direction, closing);
  target.detached.push(rover);
  return new WorldRuntime(target);
}
/** Steps the pair for ten seconds; returns how far the target ended from its place and its top speed. */
function pushed(target, runtime, axis) {
  const along = surfaceAxis(target, axis.x, axis.y, axis.z),
    start = place(target);
  let fastest = 0;
  for (let i = 0; i < 120 * 10; i++) {
    runtime.step(dt, awake);
    fastest = Math.max(fastest, speed(target));
  }
  assert.equal(fleet(target).flatMap(v => v.failureEvents).length, 0);
  assert.ok(speed(target) < 1e-3, 'the target comes to rest');
  assert.equal(gripped(target), wheels(target), 'and its tyres grip again');
  return {moved: place(target).sub(start).dot(along), fastest};
}

test('a braked aircraft springs back from a light bump and is shoved along by a hard one', () => {
  const nose = new T.Vector3(0, 0, 1);
  // A bump from behind that stays inside the tyres' give leaves the aircraft where it stood.
  const light = new Flight(preset('plane'), 'runway');
  try {
    const {moved, fastest} = pushed(light, rammed(light, nose, 12, 3), nose);
    assert.ok(fastest > 0.2, `the bump moves it: ${fastest} m/s`);
    assert.ok(Math.abs(moved) < 1e-3, `and it returns: ${moved} m`);
  } finally {
    light.dispose();
  }
  const hard = new Flight(preset('plane'), 'runway');
  try {
    const {moved, fastest} = pushed(hard, rammed(hard, nose, 12, 8.5), nose);
    assert.ok(fastest > 0.8, `${fastest} m/s`);
    assert.ok(moved > 0.01 && moved < 0.15, `the tyres slide: ${moved} m`);
  } finally {
    hard.dispose();
  }
});

test('a rover hitting a braked rover side-on slides it as far as the speed-proportional tyre does', () => {
  const side = new T.Vector3(-1, 0, 0),
    target = new Flight(preset('rover'), 'runway');
  try {
    const {moved, fastest} = pushed(target, rammed(target, side, 4, 9), side);
    assert.ok(fastest > 2, `${fastest} m/s`);
    // 0.97 m without the grip: the slide is almost all above the speed where the tyres take hold.
    assert.ok(moved > 0.9 && moved < 1.05, `${moved} m`);
  } finally {
    target.dispose();
  }
});

test('a save keeps the hold of every tyre', () => {
  const f = standing();
  let restored;
  try {
    const saved = saveFlight(f);
    restored = loadFlight(JSON.parse(JSON.stringify(saved)));
    assert.deepEqual([...restored.wheelMotion], [...f.wheelMotion]);
    assert.equal(gripped(restored), wheels(restored));
    const bad = JSON.parse(JSON.stringify(saved));
    bad.wheelMotion[0][1].anchor = [0, 'x', 0];
    assert.throws(() => loadFlight(bad));
    // The restored aircraft stands where the saved one does.
    const start = place(restored);
    for (let i = 0; i < 1200; i++) restored.step(dt, awake);
    assert.ok(place(restored).distanceTo(start) < 1e-4, `moved ${place(restored).distanceTo(start)} m`);
  } finally {
    f.dispose();
    restored?.dispose();
  }
});
