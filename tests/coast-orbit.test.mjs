import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {keplerDrift, coastDrift, coastStepLimit} from '../dist/coast-orbit.js';
import {PRIMARY, MOON, bodyState, lunarTrial, advanceCelestialOrbit} from '../dist/celestial.js';

const vec = (x, y, z) => new T.Vector3(x, y, z);
const energy = (p, v, mu) => v.lengthSq() / 2 - mu / p.length();

test('Circular coast returns after many periods without energy or angular momentum drift', () => {
  const mu = PRIMARY.mu,
    r = 680000,
    p = vec(0, r, 0),
    v = vec(0, 0, Math.sqrt(mu / r)),
    period = 2 * Math.PI * Math.sqrt(r ** 3 / mu);
  const before = [p.toArray(), v.toArray()],
    next = keplerDrift(p, v, mu, period * 20);
  assert.ok(next.position.distanceTo(p) < 0.01);
  assert.ok(next.velocity.distanceTo(v) < 0.0001);
  assert.deepEqual([p.toArray(), v.toArray()], before);
  assert.ok(Math.abs(energy(next.position, next.velocity, mu) - energy(p, v, mu)) < 0.001);
});

test('Elliptic, near-parabolic and escaping coasts are reversible and conserve invariants', () => {
  const mu = PRIMARY.mu,
    p = vec(680000, 0, 0);
  for (const factor of [0.85, Math.sqrt(2) * (1 - 1e-9), Math.sqrt(2), 1.7]) {
    const v = vec(0, Math.sqrt(mu / p.length()) * factor, 0),
      h = p.clone().cross(v),
      next = keplerDrift(p, v, mu, 28800),
      back = keplerDrift(next.position, next.velocity, mu, -28800);
    assert.ok(back.position.distanceTo(p) < 1, `position ${factor}: ${back.position.distanceTo(p)}`);
    assert.ok(back.velocity.distanceTo(v) < 0.01);
    assert.ok(Math.abs(energy(next.position, next.velocity, mu) - energy(p, v, mu)) < 0.01);
    assert.ok(next.position.clone().cross(next.velocity).distanceTo(h) / h.length() < 1e-8);
  }
  assert.throws(() => keplerDrift(p, vec(NaN, 0, 0), mu, 10));
  assert.throws(() => keplerDrift(vec(0, 0, 0), vec(1, 0, 0), mu, 10));
});

test('Translated lunar coast agrees with fine numerical flight integration over eight hours', () => {
  const time = 40000,
    {pos, vel} = lunarTrial(time),
    expected = coastDrift(pos, vel, time, 28800);
  let p = pos.clone(),
    v = vel.clone();
  const zero = vec(0, 0, 0),
    dt = 0.2;
  for (let i = 0; i < 144000; i++) {
    const n = advanceCelestialOrbit(p, v, zero, dt, time + i * dt);
    p = n.pos;
    v = n.vel;
  }
  assert.ok(p.distanceTo(expected.position) < 20, `position error ${p.distanceTo(expected.position)}`);
  assert.ok(v.distanceTo(expected.velocity) < 0.1);
});

test('Coast limits stop ahead of burn, atmosphere, lunar surface and either side of the SOI', () => {
  const p = vec(0, 80000, 0),
    v = vec(0, 0, 2278),
    time = 100;
  assert.equal(coastStepLimit(p, v, time, {deadline: 110}).reason, 'maneuver');
  assert.equal(coastStepLimit(p, v, time, {deadline: 110}).dt, 0);
  assert.ok(coastStepLimit(p, v, time, {deadline: 116}).dt <= 1);
  assert.equal(coastStepLimit(vec(0, 70500, 0), v, time).dt, 0);
  const moon = bodyState(MOON, time);
  assert.equal(coastStepLimit(moon.position.clone().add(vec(0, 201500, 0)), moon.velocity, time).dt, 0);
  for (const side of [-1, 1]) {
    const near = moon.position.clone().add(vec(MOON.sphereOfInfluence + side * 500, 0, 0));
    assert.deepEqual(coastStepLimit(near, moon.velocity, time), {dt: 0, reason: 'soi'});
  }
  assert.throws(() => coastStepLimit(p, v, time, {margin: 0}));
});

test('Fast approaches cannot jump the atmospheric or lunar boundary in one permitted step', () => {
  const time = 2000,
    moon = bodyState(MOON, time);
  const cases = [
    {p: vec(0, 100000, 0), v: vec(0, -50000, 0)},
    {
      p: moon.position.clone().add(vec(-MOON.sphereOfInfluence - 100000, 0, 0)),
      v: moon.velocity.clone().add(vec(100000, 0, 0))
    }
  ];
  for (const {p, v} of cases) {
    const limit = coastStepLimit(p, v, time, {requested: 10000});
    assert.ok(limit.dt > 0 && limit.dt < 1);
    const next = coastDrift(p, v, time, limit.dt);
    assert.ok(
      next.position.distanceTo(bodyState(PRIMARY, time + limit.dt).position) >
        PRIMARY.radius + PRIMARY.atmosphereTop + 1000
    );
    assert.ok(
      next.position.distanceTo(bodyState(MOON, time + limit.dt).position) > MOON.sphereOfInfluence + 1000
    );
  }
});
