import {keplerDrift} from '../dist/coast-orbit.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {advanceCelestialOrbit, referenceBody, bodyState, MOON, PRIMARY} from '../dist/celestial.js';
import {finiteBurnPreview} from '../dist/finite-burn.js';
import {predictTrajectory} from '../dist/trajectory.js';

import golden from './golden/celestial-integration.json' with {type: 'json'};
const center = f => f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));

function sampleFlight() {
  const f = new Flight(preset('orbiter'), 'moon-orbit', 45000);
  try {
    f.sas = false;
    for (let i = 0; i < 7200; i++) f.step(1 / 120);
    return {
      time: f.universalTime,
      body: f.orbit.bodyId,
      position: center(f).toArray(),
      velocity: f.vel.toArray()
    };
  } finally {
    f.dispose();
  }
}

function sampleBurn() {
  const f = new Flight(preset('returner'), 'orbit', 45000);
  try {
    f.stageNext();
    f.stageNext();
    const result = finiteBurnPreview(f, new Vector3(0, 0, -50), 45060, {throttle: 0.1, step: 0.1});
    return {
      time: result.endTime,
      body: result.orbit.bodyId,
      position: result.points.at(-1).toArray(),
      velocity: result.orbit.relativeVelocity.clone().add(result.orbit.bodyVelocity).toArray(),
      fuel: result.fuelUsed
    };
  } finally {
    f.dispose();
  }
}

function sampleFlyby() {
  const epoch = 2000,
    moon = bodyState(MOON, epoch);
  const result = predictTrajectory(
    moon.position.clone().add(new Vector3(-MOON.sphereOfInfluence - 10000, 600000, 0)),
    moon.velocity.clone().add(new Vector3(4000, 0, 0)),
    epoch,
    {duration: 1800}
  );
  assert.equal(result.complete, true);
  return {
    time: result.endTime,
    position: result.position,
    velocity: result.velocity,
    events: result.events.map(({type, time, position}) => ({type, time, position}))
  };
}

function near(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, label + ' expected ' + expected + ' got ' + actual);
}
function vectorNear(actual, expected, tolerance, label) {
  near(new Vector3(...actual).distanceTo(new Vector3(...expected)), 0, tolerance, label);
}
// Captured at c0396f3. Distances are metres, speed m/s, epochs seconds.
for (const [name, run] of [
  ['flight', sampleFlight],
  ['burn', sampleBurn],
  ['flyby', sampleFlyby]
]) {
  test('celestial integration baseline: ' + name, () => {
    const value = run(),
      expected = golden[name];
    vectorNear(value.position, expected.position, 0.1, 'position');
    vectorNear(value.velocity, expected.velocity, 0.001, 'velocity');
    near(value.time, expected.time, 0.0001, 'epoch');
    if (name !== 'flyby') assert.equal(value.body, expected.body);
    if (name === 'burn') near(value.fuel, expected.fuel, 0.001, 'propellant');
    if (name === 'flyby') {
      assert.deepEqual(
        value.events.map(e => e.type),
        expected.events.map(e => e.type)
      );
      for (const [i, e] of value.events.entries()) {
        near(e.time, expected.events[i].time, 0.0001, e.type + ' epoch');
        vectorNear(e.position, expected.events[i].position, 0.1, e.type + ' position');
      }
    }
  });
}

test('a crossing step integrates in its initial body frame and reports its final body', () => {
  const time = 40000,
    dt = 10,
    moon = bodyState(MOON, time);
  for (const [from, to, sign] of [
    [PRIMARY, MOON, 1],
    [MOON, PRIMARY, -1]
  ]) {
    const start = moon.position.clone().add(new Vector3(MOON.sphereOfInfluence + sign * 500, 0, 0));
    const velocity = moon.velocity.clone().add(new Vector3(-sign * 100, 0, 0));
    assert.equal(referenceBody(start, time).id, from.id);
    const next = advanceCelestialOrbit(start, velocity, new Vector3(), dt, time);
    assert.equal(next.bodyId, to.id);
    // Independent local two-body solution, including the initial body's translation.
    const origin = bodyState(from, time),
      end = bodyState(from, time + dt);
    const local = keplerDrift(
      start.clone().sub(origin.position),
      velocity.clone().sub(origin.velocity),
      from.mu,
      dt
    );
    vectorNear(next.pos.toArray(), local.position.add(end.position).toArray(), 0.001, 'crossing position');
    vectorNear(next.vel.toArray(), local.velocity.add(end.velocity).toArray(), 0.00001, 'crossing velocity');
  }
});
