import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {isParked} from '../dist/ground-rest.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import {MOON, bodyAltitude, bodyState, bodyUp, referenceBody} from '../dist/celestial.js';
import {
  inertialToFixed,
  surfaceAngularVelocity,
  surfaceRelativeVelocity,
  surfaceVelocity
} from '../dist/surface-frame.js';

// A parked vessel with nothing commanded discards what the solver returns, so the solver runs once
// per rest and is skipped afterwards. Everything else in the step keeps happening.
const dt = 1 / 120;
/** Counts the solver steps of one vessel. */
function solves(f) {
  let n = 0;
  const step = f.world.step.bind(f.world);
  f.world.step = () => {
    n++;
    step();
  };
  return () => n;
}
const altitude = f => bodyAltitude(f.pos, f.universalTime),
  center = f => f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),
  surfaceSpeed = f => surfaceRelativeVelocity(center(f), f.vel, f.universalTime).length(),
  climbRate = f =>
    surfaceRelativeVelocity(center(f), f.vel, f.universalTime).dot(bodyUp(f.pos, f.universalTime)),
  fixed = f => inertialToFixed(f.pos, f.universalTime),
  run = (f, steps, input) => {
    for (let i = 0; i < steps; i++) f.step(dt, input);
  };
/** A hopper without SAS, settled on its legs and parked. */
function parkedHopper(steps = 1200) {
  const f = new Flight(preset('hopper'), 'land');
  f.sas = false;
  const count = solves(f);
  run(f, steps);
  assert.equal(isParked(f), true);
  return {f, count};
}

test('a parked vessel stops solving and keeps every other part of the step', () => {
  const {f, count} = parkedHopper();
  try {
    const before = count(),
      rest = altitude(f),
      place = fixed(f),
      q = f.q.clone(),
      time = f.time;
    run(f, 6000);
    assert.equal(count(), before, 'no solver step while parked');
    assert.equal(isParked(f), true);
    assert.equal(f.landed, true);
    assert.equal(f.crashed, false);
    assert.ok(Math.abs(f.time - time - 50) < 1e-6);
    assert.ok(f.landedTime > 50);
    assert.equal(f.telemetry.groundContact, true);
    assert.ok(f.telemetry.surfaceSpeed < 1e-6);
    assert.equal(f.telemetry.engine, 'Rust Rapier 0.21');
    assert.ok(f.telemetry.thermal && f.telemetry.power && f.telemetry.atmosphere);
    assert.ok(f.telemetry.force.length() < 1e-3);
    assert.ok(Math.abs(altitude(f) - rest) < 1e-6);
    // The planet carries it: the same place and attitude on the surface after 50 s.
    assert.ok(fixed(f).distanceTo(place) < 1e-5, `drift ${fixed(f).distanceTo(place)}`);
    assert.ok(f.q.angleTo(q) > 0.01, 'the attitude turns with the planet');
    assert.ok(surfaceSpeed(f) < 1e-9);
    assert.ok(f.omega.distanceTo(surfaceAngularVelocity()) < 1e-12);
  } finally {
    f.dispose();
  }
});

test('planet rotation carries a parked vessel for an hour without drift', () => {
  const {f, count} = parkedHopper();
  try {
    const before = count(),
      rest = altitude(f),
      place = fixed(f),
      up = new T.Vector3(0, 1, 0).applyQuaternion(f.q).dot(bodyUp(f.pos, f.universalTime));
    for (let i = 0; i < 3600 * 30; i++) f.step(1 / 30);
    assert.equal(count(), before);
    assert.equal(isParked(f), true);
    assert.ok(Math.abs(altitude(f) - rest) < 1e-5, `altitude ${altitude(f) - rest}`);
    assert.ok(fixed(f).distanceTo(place) < 1e-4, `drift ${fixed(f).distanceTo(place)}`);
    assert.ok(
      Math.abs(new T.Vector3(0, 1, 0).applyQuaternion(f.q).dot(bodyUp(f.pos, f.universalTime)) - up) < 1e-9
    );
    assert.ok(surfaceSpeed(f) < 1e-9);
  } finally {
    f.dispose();
  }
});

test('a parked vessel stays parked across save and load and is not dropped again', () => {
  const {f} = parkedHopper();
  let loaded;
  try {
    run(f, 2400);
    const rest = altitude(f),
      place = fixed(f);
    loaded = loadFlight(JSON.parse(JSON.stringify(saveFlight(f))));
    const count = solves(loaded);
    assert.equal(isParked(loaded), true);
    for (let i = 0; i < 2400; i++) {
      loaded.step(dt);
      assert.equal(loaded.landed, true, `landed at step ${i}`);
      assert.equal(isParked(loaded), true, `parked at step ${i}`);
    }
    // The new world has no contacts yet: it solves once from the loaded rest, then never again.
    assert.equal(count(), 1);
    assert.equal(loaded.telemetry.groundContact, true);
    assert.ok(Math.abs(altitude(loaded) - rest) < 1e-6);
    assert.ok(fixed(loaded).distanceTo(place) < 1e-5);
  } finally {
    f.dispose();
    loaded?.dispose();
  }
});

// The solver origin is recentred every kilometre the surface carries a vessel, which by itself moves a
// vessel resting on the ground. The windows below lie between two recentrings.
const sameOrigin = (f, origin) =>
  assert.ok(origin.equals(f.physicsOrigin), 'the solver origin was recentred');

test('a long-parked craft starts its engines without a jump', () => {
  for (const parkedSteps of [300, 1500, 4200, 9000]) {
    const {f, count} = parkedHopper(parkedSteps);
    try {
      const before = count(),
        rest = altitude(f),
        origin = f.physicsOrigin.clone();
      f.stageNext();
      f.throttle = 1;
      f.step(dt);
      assert.equal(count(), before + 1, 'thrust runs the solver again');
      // One step of the 6.3 m/s² net acceleration: 0.05 m/s and under a millimetre.
      const first = altitude(f) - rest;
      assert.ok(first > 0 && first < 0.001, `first step rose ${first} m after ${parkedSteps} parked steps`);
      assert.ok(climbRate(f) > 0.03 && climbRate(f) < 0.07, `first step climbs ${climbRate(f)} m/s`);
      assert.ok(f.omega.distanceTo(surfaceAngularVelocity()) < 1e-3, 'no turn');
      let previous = climbRate(f);
      for (let i = 0; i < 240; i++) {
        f.step(dt);
        const rate = climbRate(f);
        assert.ok(Math.abs(rate - previous) < 0.08, `step ${i} changes the climb by ${rate - previous}`);
        previous = rate;
      }
      assert.equal(count(), before + 241);
      sameOrigin(f, origin);
      assert.ok(altitude(f) - rest > 5, 'lifted off');
      assert.equal(f.landed, false);
    } finally {
      f.dispose();
    }
  }
});

test('a long-parked craft woken without a force stays where it rests', () => {
  const {f, count} = parkedHopper(4200);
  try {
    const before = count(),
      rest = altitude(f),
      place = fixed(f),
      origin = f.physicsOrigin.clone();
    // A translation command without RCS produces no force but ends the hold.
    for (let i = 0; i < 240; i++) {
      f.step(dt, {translateX: 1});
      assert.ok(Math.abs(altitude(f) - rest) < 5e-4, `step ${i} altitude ${altitude(f) - rest}`);
      assert.ok(surfaceSpeed(f) < 0.02, `step ${i} speed ${surfaceSpeed(f)}`);
      assert.equal(f.landed, true);
    }
    assert.equal(count(), before + 240);
    sameOrigin(f, origin);
    assert.ok(fixed(f).distanceTo(place) < 2e-3);
    run(f, 600);
    assert.equal(isParked(f), true);
    assert.equal(count(), before + 241, 'parks again after one solve from the new rest');
  } finally {
    f.dispose();
  }
});

test('commands, SAS and RCS input run the solver on a parked vessel', () => {
  const {f, count} = parkedHopper();
  try {
    let n = count();
    for (const input of [{pitch: 0.5}, {yaw: -0.2}, {roll: 1}, {translateY: 1}, {drive: 1}]) {
      f.step(dt, input);
      assert.equal(count(), ++n, JSON.stringify(input));
    }
    f.sas = true;
    f.holdQ = f.q.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), 0.2));
    f.step(dt);
    assert.equal(count(), ++n, 'SAS steering');
  } finally {
    f.dispose();
  }
});

test('a parked vessel that is moved or rebuilt is solved again', () => {
  const {f, count} = parkedHopper();
  try {
    let n = count();
    const rest = altitude(f);
    // New colliders (staging, docking, gear, cargo doors) have no contacts with the ground yet.
    f.buildColliders();
    run(f, 120);
    assert.equal(count(), ++n, 'one solve on the new colliders');
    assert.equal(isParked(f), true);
    // Lifted off the ground while still marked as landed: it must fall, not hang.
    f.pos.addScaledVector(bodyUp(f.pos, f.universalTime), 3);
    f.step(dt);
    assert.equal(count(), ++n);
    run(f, 120);
    assert.equal(f.landed, false);
    assert.ok(altitude(f) < rest + 2.9, 'falling');
    run(f, 1200);
    assert.equal(isParked(f), true);
    assert.ok(Math.abs(altitude(f) - rest) < 0.01);
  } finally {
    f.dispose();
  }
});

test('a parked stage hit by another vessel starts moving', () => {
  const {f: a, count} = parkedHopper();
  const b = new Flight(preset('hopper'), 'land');
  try {
    const before = count(),
      place = fixed(a),
      side = new T.Vector3(0, 0, 1).applyQuaternion(a.q);
    b.sas = false;
    b.universalTime = a.universalTime;
    b.q.copy(a.q);
    b.pos.copy(a.pos).addScaledVector(side, 6);
    b.vel.copy(surfaceVelocity(b.pos, b.universalTime)).addScaledVector(side, -5);
    b.omega.copy(a.omega);
    a.detached.push(b);
    let hit = -1;
    for (let i = 0; i < 600; i++) {
      a.step(dt);
      if (hit < 0 && surfaceSpeed(a) > 0.1) {
        hit = i;
        // The impulse arrives after the vessels have stepped: the parked one had not solved yet.
        assert.equal(count(), before);
      } else if (hit >= 0 && i === hit + 1)
        assert.equal(count(), before + 1, 'solved on the step after the hit');
    }
    assert.ok(hit > 0, 'the vessels collided');
    assert.ok(count() > before + 20);
    assert.ok(fixed(a).distanceTo(place) > 0.1, `pushed ${fixed(a).distanceTo(place)} m`);
    assert.equal(a.crashed, false);
  } finally {
    a.dispose();
  }
});

test('a parked rover drives away', () => {
  const f = new Flight(preset('rover'), 'land');
  try {
    f.sas = false;
    const count = solves(f);
    run(f, 1200);
    assert.equal(f.brake, true);
    assert.equal(isParked(f), true);
    const before = count(),
      place = fixed(f);
    run(f, 1200);
    assert.equal(count(), before, 'braked on its wheels without solving');
    assert.ok(f.telemetry.contacts > 0);
    assert.ok(f.telemetry.wheelContacts.length > 0);
    assert.ok(fixed(f).distanceTo(place) < 1e-5);
    f.brake = false;
    run(f, 600, {drive: 1});
    assert.equal(count(), before + 600);
    assert.ok(fixed(f).distanceTo(place) > 10, `drove ${fixed(f).distanceTo(place)} m`);
    assert.equal(f.crashed, false);
  } finally {
    f.dispose();
  }
});

test('a parked aircraft releases its brakes and rolls under thrust', () => {
  const f = new Flight(preset('plane'), 'runway');
  try {
    f.sas = false;
    const count = solves(f);
    run(f, 1200);
    assert.equal(isParked(f), true);
    const before = count(),
      place = fixed(f);
    f.brake = false;
    run(f, 240);
    // Level ground and no thrust: it is still landed and at rest, so it stays held.
    assert.equal(count(), before);
    assert.ok(fixed(f).distanceTo(place) < 1e-5);
    f.stageNext();
    f.throttle = 1;
    f.step(dt);
    assert.equal(count(), before + 1);
    assert.ok(surfaceSpeed(f) < 0.2, `first step ${surfaceSpeed(f)} m/s`);
    run(f, 600);
    assert.equal(count(), before + 601);
    assert.ok(fixed(f).distanceTo(place) > 30, `rolled ${fixed(f).distanceTo(place)} m`);
    assert.ok(surfaceSpeed(f) > 10);
    assert.equal(f.crashed, false);
  } finally {
    f.dispose();
  }
});

test('a vessel parked on the Moon stays put and lifts off without a jump', () => {
  const f = new Flight(preset('hopper'), 'land');
  try {
    f.sas = false;
    const count = solves(f),
      time = f.universalTime,
      direction = new T.Vector3(0.3, 0.8, 0.5).normalize();
    f.q.setFromUnitVectors(new T.Vector3(0, 1, 0), direction);
    f.pos.copy(bodyState(MOON, time).position).addScaledVector(direction, MOON.radius + 1.9);
    f.vel.copy(surfaceVelocity(f.pos, time, MOON));
    f.omega.copy(surfaceAngularVelocity(MOON));
    run(f, 1200);
    assert.equal(referenceBody(f.pos, f.universalTime).id, 'moon');
    assert.equal(isParked(f), true);
    const before = count(),
      rest = altitude(f),
      place = fixed(f);
    run(f, 6000);
    assert.equal(count(), before);
    assert.equal(f.landed, true);
    assert.ok(Math.abs(altitude(f) - rest) < 1e-6);
    assert.ok(fixed(f).distanceTo(place) < 1e-4, `drift ${fixed(f).distanceTo(place)}`);
    f.stageNext();
    f.throttle = 1;
    f.step(dt);
    assert.equal(count(), before + 1);
    // One step of the 14.5 m/s² net acceleration in lunar gravity.
    assert.ok(
      altitude(f) - rest > 0 && altitude(f) - rest < 0.002,
      `first step rose ${altitude(f) - rest} m`
    );
    assert.ok(climbRate(f) > 0.08 && climbRate(f) < 0.16, `first step climbs ${climbRate(f)} m/s`);
    run(f, 240);
    assert.ok(altitude(f) - rest > 10);
  } finally {
    f.dispose();
  }
});

test('a floating vessel is never parked and is solved on every step', () => {
  const f = new Flight(preset('boat'), 'water');
  try {
    f.sas = false;
    const count = solves(f);
    for (let i = 0; i < 2400; i++) {
      f.step(dt);
      assert.equal(isParked(f), false, `parked at step ${i}`);
    }
    assert.equal(count(), 2400);
    assert.equal(f.crashed, false);
    assert.ok(surfaceSpeed(f) < 0.1, 'afloat and still');
  } finally {
    f.dispose();
  }
});
