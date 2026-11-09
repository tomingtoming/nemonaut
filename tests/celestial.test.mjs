import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {PLANET, center, orbitState} from '../dist/planet.js';
import {advanceOrbit} from '../tools/golden/planet-step-reference.mjs';
import {
  MOON,
  PRIMARY,
  MOON_PERIOD,
  bodyState,
  referenceBody,
  relativeMotion,
  bodyAltitude,
  bodyGravity,
  bodyOrbitState,
  advanceCelestialOrbit,
  lunarTrial
} from '../dist/celestial.js';
import {navDirections} from '../dist/navigation.js';
import {apsisPlan} from '../dist/orbit-plan.js';
const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);

test('Moon ephemeris has the stock circular radius, period and differential velocity', () => {
  near(MOON_PERIOD, 138984.376574476, 0.001);
  for (const time of [0, 12345, 1e8]) {
    const a = bodyState(MOON, time),
      b = bodyState(MOON, time + 0.01),
      cycle = bodyState(MOON, time + MOON_PERIOD);
    near(a.position.distanceTo(center), 12000000, 1e-7);
    near(a.velocity.length(), Math.sqrt(PLANET.mu / 12000000));
    assert.ok(b.position.clone().sub(a.position).divideScalar(0.01).distanceTo(a.velocity) < 0.001);
    assert.ok(cycle.position.distanceTo(a.position) < 1e-5);
  }
});

test('Lunar altitude and orbit use relative velocity, not the moon orbital speed', () => {
  const time = 30000,
    trial = lunarTrial(time),
    o = bodyOrbitState(trial.pos, trial.vel, time);
  assert.equal(o.bodyId, 'moon');
  near(o.altitude, 20000, 1e-7);
  near(o.apoapsis, 20000, 1e-6);
  near(o.periapsis, 20000, 1e-6);
  near(o.vertical, 0);
  near(o.speed, Math.sqrt(MOON.mu / 220000));
  assert.ok(o.stable);
  near(bodyGravity(trial.pos, time).length(), MOON.mu / 220000 ** 2);
  near(bodyAltitude(trial.pos, time), 20000);
  const relative = relativeMotion(trial.pos, trial.vel, time);
  assert.ok(relative.center.clone().add(relative.r).distanceTo(trial.pos) < 1e-8);
  assert.ok(relative.bodyVelocity.clone().add(relative.velocity).distanceTo(trial.vel) < 1e-8);
});

test('Unpowered lunar circular orbit closes while the moon continues moving', () => {
  const start = 12345,
    initial = lunarTrial(start),
    original = relativeMotion(initial.pos, initial.vel, start),
    period = bodyOrbitState(initial.pos, initial.vel, start).period,
    steps = 12000,
    dt = period / steps;
  let pos = initial.pos.clone(),
    vel = initial.vel.clone();
  for (let i = 0; i < steps; i++) {
    const next = advanceCelestialOrbit(pos, vel, new T.Vector3(), dt, start + i * dt);
    pos = next.pos;
    vel = next.vel;
    assert.equal(next.bodyId, 'moon');
  }
  const result = relativeMotion(pos, vel, start + period),
    o = bodyOrbitState(pos, vel, start + period);
  assert.ok(result.r.distanceTo(original.r) < 1);
  assert.ok(result.velocity.distanceTo(original.velocity) < 0.005);
  near(o.periapsis, 20000, 0.2);
  near(o.apoapsis, 20000, 0.2);
  assert.ok(bodyState(MOON, start + period).position.distanceTo(bodyState(MOON, start).position) > 1e6);
});

test('Mother-planet dynamics remain identical outside lunar influence', () => {
  const pos = new T.Vector3(0, 80000, 0),
    vel = new T.Vector3(0, 0, Math.sqrt(PLANET.mu / 680000)),
    acceleration = new T.Vector3(0.1, 0.2, 0.3);
  const old = advanceOrbit(pos, vel, acceleration, 0.1),
    next = advanceCelestialOrbit(pos, vel, acceleration, 0.1, 900);
  assert.equal(next.bodyId, 'planet');
  assert.ok(old.pos.distanceTo(next.pos) < 1e-8);
  assert.ok(old.vel.distanceTo(next.vel) < 1e-10);
  const a = orbitState(pos, vel),
    b = bodyOrbitState(pos, vel, 900);
  for (const key of ['altitude', 'speed', 'vertical', 'periapsis', 'apoapsis', 'period'])
    near(a[key], b[key]);
});

test('Entering and leaving the lunar sphere preserve continuous inertial position and velocity', () => {
  for (const direction of [-1, 1]) {
    const time = 200,
      moon = bodyState(MOON, time),
      r = MOON.sphereOfInfluence - direction * 0.1,
      pos = moon.position.clone().add(new T.Vector3(r, 0, 0)),
      vel = moon.velocity.clone().add(new T.Vector3(direction * 100, 0, 0));
    assert.equal(referenceBody(pos, time).id, direction === 1 ? 'moon' : 'planet');
    const next = advanceCelestialOrbit(pos, vel, new T.Vector3(), 0.01, time);
    assert.equal(next.bodyId, direction === 1 ? 'planet' : 'moon');
    assert.ok(next.pos.distanceTo(pos.clone().addScaledVector(vel, 0.01)) < 0.001);
    assert.ok(next.vel.distanceTo(vel) < 0.001);
  }
  assert.equal(PRIMARY.atmosphereTop, 70000);
});

test('Lunar navigation and apsis guidance use lunar local speed and gravity', () => {
  const time = 47000,
    moon = bodyState(MOON, time),
    rp = 220000,
    ra = 400000;
  const pos = moon.position.clone().add(new T.Vector3(0, rp, 0)),
    vel = moon.velocity.clone().add(new T.Vector3(0, 0, Math.sqrt((MOON.mu * 2 * ra) / (rp * (rp + ra)))));
  const nav = navDirections(pos, vel, time);
  assert.ok(nav.prograde.distanceTo(new T.Vector3(0, 0, 1)) < 1e-10);
  assert.ok(nav.radial.distanceTo(new T.Vector3(0, 1, 0)) < 1e-10);
  const o = bodyOrbitState(pos, vel, time),
    plan = apsisPlan(o),
    period = 2 * Math.PI * Math.sqrt(((rp + ra) / 2) ** 3 / MOON.mu);
  near(plan.apoapsis.altitude, 200000);
  near(plan.periapsis.altitude, 20000);
  near(plan.apoapsis.time, period / 2);
  near(plan.apoapsis.deltaV, Math.sqrt(MOON.mu / ra) - Math.sqrt((MOON.mu * 2 * rp) / (ra * (rp + ra))));
  assert.ok(!plan.caution.includes('大気'));
});

test('Sphere crossing error shrinks as the integration step is refined', () => {
  const time = 300,
    moon = bodyState(MOON, time),
    pos = moon.position.clone().add(new T.Vector3(MOON.sphereOfInfluence + 123, 0, 0)),
    vel = moon.velocity.clone().add(new T.Vector3(-100, 0, 0));
  const run = dt => {
    let p = pos.clone(),
      v = vel.clone();
    for (let i = 0; i < 5 / dt; i++) {
      const next = advanceCelestialOrbit(p, v, new T.Vector3(), dt, time + i * dt);
      p = next.pos;
      v = next.vel;
    }
    return {p, v};
  };
  const coarse = run(0.5),
    fine = run(0.25),
    reference = run(1 / 128);
  assert.ok(fine.p.distanceTo(reference.p) < coarse.p.distanceTo(reference.p));
  assert.ok(fine.v.distanceTo(reference.v) < coarse.v.distanceTo(reference.v));
});
