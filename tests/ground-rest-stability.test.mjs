import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {MOON, bodyAltitude, bodyState, bodyUp, referenceBody} from '../dist/celestial.js';
import {inertialToFixed, surfaceAngularVelocity, surfaceVelocity} from '../dist/surface-frame.js';

// A vessel standing on the ground whose step result is kept (SAS on, or any input) is solved on
// every step while the planet carries it and the ground along. It has to stand still through that.
const dt = 1 / 120;
/** Steps in which the home planet's equator travels one kilometre at 120 Hz. */
const KILOMETRE = 686;
// The bound on any movement of a standing vessel: the solver's allowed contact error (1 mm).
const STILL = 1e-3;
const altitude = f => bodyAltitude(f.pos, f.universalTime),
  fixed = f => inertialToFixed(f.pos, f.universalTime),
  // The vessel's own up axis seen from the rotating surface: constant while the vessel stands still.
  lean = f => new T.Vector3(0, 1, 0).applyQuaternion(f.q).angleTo(bodyUp(f.pos, f.universalTime)),
  heading = f =>
    inertialToFixed(
      new T.Vector3(1, 0, 0)
        .applyQuaternion(f.q)
        .add(bodyState(referenceBody(f.pos, f.universalTime), f.universalTime).position),
      f.universalTime,
      referenceBody(f.pos, f.universalTime)
    );
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
/**
 * Lets the vessel settle, then steps it and checks on every step that it stays where it settled:
 * altitude, place on the surface, lean and heading, and that no single step lifts or drops it.
 */
function standsStill(f, {settle, steps, input, place: placeBound = STILL, heading: headingBound = 2e-4}) {
  for (let i = 0; i < settle; i++) f.step(dt, input);
  const count = solves(f),
    rest = altitude(f),
    place = fixed(f),
    tilt = lean(f),
    facing = heading(f);
  let previous = rest,
    worst = {altitude: 0, place: 0, lean: 0, heading: 0, step: 0};
  for (let i = 0; i < steps; i++) {
    f.step(dt, input);
    const a = altitude(f);
    worst = {
      altitude: Math.max(worst.altitude, Math.abs(a - rest)),
      place: Math.max(worst.place, fixed(f).distanceTo(place)),
      lean: Math.max(worst.lean, Math.abs(lean(f) - tilt)),
      heading: Math.max(worst.heading, heading(f).distanceTo(facing)),
      step: Math.max(worst.step, Math.abs(a - previous))
    };
    previous = a;
  }
  const report = JSON.stringify(worst);
  assert.equal(f.crashed, false);
  assert.equal(f.landed, true);
  assert.ok(worst.altitude < STILL, `altitude moved: ${report}`);
  assert.ok(worst.place < placeBound, `place moved: ${report}`);
  assert.ok(worst.step < STILL / 4, `a single step moved it: ${report}`);
  // 1 mm at the end of a 5 m lever.
  assert.ok(worst.lean < 2e-4, `lean changed: ${report}`);
  assert.ok(worst.heading < headingBound, `heading changed: ${report}`);
  return {solved: count(), worst};
}
/** Places a vessel upright on the Moon's surface with the surface's motion. */
function onTheMoon(f, clearance) {
  const time = f.universalTime,
    direction = new T.Vector3(0.3, 0.8, 0.5).normalize();
  f.q.setFromUnitVectors(new T.Vector3(0, 1, 0), direction);
  f.pos.copy(bodyState(MOON, time).position).addScaledVector(direction, MOON.radius + clearance);
  f.vel.copy(surfaceVelocity(f.pos, time, MOON));
  f.omega.copy(surfaceAngularVelocity(MOON));
}
// An input that produces no force on a vessel without RCS thrusters but makes the step keep what the
// solver returns, whatever the SAS commands are.
const awake = {translateX: 1};

test('a hopper standing on the pad with SAS on does not move', () => {
  const f = new Flight(preset('hopper'), 'land');
  try {
    f.sas = true;
    const {solved} = standsStill(f, {settle: 360, steps: 4 * KILOMETRE});
    assert.equal(solved, 4 * KILOMETRE, 'SAS keeps the solver running');
  } finally {
    f.dispose();
  }
});

test('a hopper kept awake by an input stands still at 60 Hz steps as well', () => {
  const f = new Flight(preset('hopper'), 'land');
  try {
    f.sas = false;
    for (let i = 0; i < 360; i++) f.step(dt);
    const rest = altitude(f),
      place = fixed(f);
    for (let i = 0; i < 2 * KILOMETRE; i++) {
      f.step(2 * dt, awake);
      assert.ok(Math.abs(altitude(f) - rest) < STILL, `step ${i} altitude ${altitude(f) - rest}`);
    }
    assert.ok(fixed(f).distanceTo(place) < STILL, `moved ${fixed(f).distanceTo(place)} m`);
  } finally {
    f.dispose();
  }
});

for (const [name, kind, environment] of [
  ['a lander on its legs', 'lander', 'land'],
  ['an aircraft on its gear', 'plane', 'runway'],
  ['a transport on its gear', 'transport', 'runway'],
  ['a rover with its brakes on', 'rover', 'land']
])
  test(`${name} with SAS on does not move`, () => {
    for (const input of [undefined, awake]) {
      const f = new Flight(preset(kind), environment);
      try {
        f.sas = true;
        assert.equal(f.brake || kind === 'lander', true);
        const {solved} = standsStill(f, {settle: 600, steps: 3 * KILOMETRE + 60, input});
        if (input) assert.equal(solved, 3 * KILOMETRE + 60, 'an input keeps the solver running');
      } finally {
        f.dispose();
      }
    }
  });

for (const [kind, clearance] of [
  ['hopper', 1.9],
  ['moonlander', 2.5]
])
  test(`a ${kind} standing on the Moon and kept awake does not move`, () => {
    const f = new Flight(preset(kind), 'land');
    try {
      f.sas = true;
      onTheMoon(f, clearance);
      // 40 s: the Moon carries the vessel some 20 km around the planet meanwhile.
      const {solved} = standsStill(f, {settle: 1200, steps: 4800, input: awake});
      assert.equal(referenceBody(f.pos, f.universalTime).id, 'moon');
      assert.equal(solved, 4800);
    } finally {
      f.dispose();
    }
  });

test('a lunar expedition landed on the Moon with SAS on does not move', () => {
  const f = new Flight(preset('lunar-surface-expedition'), 'moon-surface');
  try {
    f.sas = true;
    standsStill(f, {settle: 1800, steps: 4800});
    assert.equal(referenceBody(f.pos, f.universalTime).id, 'moon');
  } finally {
    f.dispose();
  }
});

test('a hopper kept awake for ten minutes neither sinks nor creeps', () => {
  const f = new Flight(preset('hopper'), 'land');
  try {
    f.sas = true;
    const steps = 600 * 120,
      {solved} = standsStill(f, {settle: 360, steps, input: awake});
    assert.equal(solved, steps);
  } finally {
    f.dispose();
  }
});

// The runway lies off the equator, where the planet's spin pushes a standing vessel sideways along the
// ground (0.17 mm/s²). Braked tyres hold that as the feet of a lander do; what remains is the breathing
// of the suspension, a few hundredths of a millimetre.
for (const kind of ['plane', 'plane-large', 'transport', 'transport-cargo', 'rover'])
  test(`a braked ${kind} kept awake on the runway for ten minutes neither sinks nor creeps`, () => {
    const f = new Flight(preset(kind), 'runway');
    try {
      f.sas = true;
      assert.equal(f.brake, true);
      const steps = 600 * 120,
        {solved} = standsStill(f, {settle: 600, steps, input: awake, place: 1e-4});
      assert.equal(solved, steps);
    } finally {
      f.dispose();
    }
  });

test('a braked aircraft stands still at 60 Hz steps as well', () => {
  for (const kind of ['plane', 'plane-large', 'transport']) {
    const f = new Flight(preset(kind), 'runway');
    try {
      f.sas = true;
      for (let i = 0; i < 600; i++) f.step(dt, awake);
      const rest = altitude(f),
        place = fixed(f),
        facing = heading(f);
      for (let i = 0; i < 60 * 60; i++) {
        f.step(2 * dt, awake);
        assert.ok(Math.abs(altitude(f) - rest) < STILL, `${kind} step ${i} altitude ${altitude(f) - rest}`);
        assert.ok(
          fixed(f).distanceTo(place) < 1e-4,
          `${kind} step ${i} moved ${fixed(f).distanceTo(place)} m`
        );
        assert.ok(f.omega.clone().sub(surfaceAngularVelocity()).length() < 1e-4, `${kind} step ${i} rocks`);
      }
      assert.ok(heading(f).distanceTo(facing) < 2e-4);
    } finally {
      f.dispose();
    }
  }
});

test('a braked aircraft passes between held and awake without moving', () => {
  const f = new Flight(preset('plane'), 'runway');
  try {
    f.sas = false;
    for (let i = 0; i < 600; i++) f.step(dt, awake);
    const place = fixed(f),
      facing = heading(f),
      count = solves(f);
    let previous = place,
      worst = 0,
      solved = 0;
    // Held (no input: the solver is skipped) and awake in turns of unequal length.
    for (const [steps, input] of [
      [KILOMETRE - 1, undefined],
      [240, awake],
      [3, undefined],
      [1, awake],
      [2 * KILOMETRE + 1, undefined],
      [1200, awake],
      [600, undefined],
      [2400, awake]
    ]) {
      for (let i = 0; i < steps; i++) {
        f.step(dt, input);
        const now = fixed(f);
        worst = Math.max(worst, now.distanceTo(previous));
        previous = now;
        assert.ok(now.distanceTo(place) < 1e-4, `moved ${now.distanceTo(place)} m`);
      }
      if (input) solved += steps;
      else assert.ok(count() <= solved + 8, 'the held aircraft skips the solver');
    }
    // No step moves it further than the suspension's breathing does.
    assert.ok(worst < 2e-6, `a single step moved it ${worst} m`);
    assert.ok(heading(f).distanceTo(facing) < 2e-4);
  } finally {
    f.dispose();
  }
});

test('a held vessel woken after any length of rest does not jump', () => {
  // Held from step 240 or so: the solver is skipped until the input arrives.
  for (const parked of [KILOMETRE - 1, KILOMETRE, 2 * KILOMETRE - 1, 3 * KILOMETRE - 1]) {
    const f = new Flight(preset('hopper'), 'land');
    try {
      f.sas = false;
      for (let i = 0; i < parked; i++) f.step(dt);
      const rest = altitude(f),
        place = fixed(f);
      for (let i = 0; i < 2 * KILOMETRE; i++) {
        f.step(dt, awake);
        assert.ok(
          Math.abs(altitude(f) - rest) < 5e-4,
          `woken after ${parked} steps: step ${i} altitude ${altitude(f) - rest}`
        );
      }
      assert.ok(fixed(f).distanceTo(place) < STILL, `moved ${fixed(f).distanceTo(place)} m`);
    } finally {
      f.dispose();
    }
  }
});
