import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {bodyState, bodyOrbitState, MOON} from '../dist/celestial.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import {launchIntoFleet} from '../dist/launch-fleet.js';
import {inEclipse, SUN_DIRECTION} from '../dist/power.js';
const com = f => f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));

test('Lunar launch and saved fleet restoration use the same nonzero ephemeris', () => {
  const f = launchIntoFleet(null, {
    parts: preset('twin'),
    environment: 'moon-orbit',
    name: 'Moon',
    universalTime: 90000
  });
  let restored;
  try {
    assert.ok(Math.abs(bodyOrbitState(com(f), f.vel, 90000).altitude - 20000) < 1e-6);
    f.stageNext();
    f.stageNext();
    f.step(0.1);
    restored = loadFlight(saveFlight(f));
    for (const v of [restored, ...restored.detached]) {
      assert.equal(v.orbit.bodyId, 'moon');
      assert.equal(v.orbit.universalTime, 90000.1);
    }
    f.step(0.1);
    restored.step(0.1);
    assert.ok(f.pos.distanceTo(restored.pos) < 1e-6);
    assert.ok(f.vel.distanceTo(restored.vel) < 1e-6);
  } finally {
    restored?.dispose();
    f.dispose();
  }
});

test('Lunar eclipse follows the moving moon and leaves the sunward side illuminated', () => {
  for (const time of [0, 40000, 90000]) {
    const center = bodyState(MOON, time).position;
    assert.equal(inEclipse(center.clone().addScaledVector(SUN_DIRECTION, -220000), time), true);
    assert.equal(inEclipse(center.clone().addScaledVector(SUN_DIRECTION, 220000), time), false);
  }
});

test('Flight follows a complete lunar orbit at a nonzero epoch with no thrust', () => {
  const epoch = 45678,
    f = new Flight(preset('orbiter'), 'moon-orbit', epoch);
  try {
    f.sas = false;
    const initial = bodyOrbitState(com(f), f.vel, epoch),
      r = initial.r.clone(),
      dt = initial.period / 8000;
    for (let i = 0; i < 8000; i++) f.step(dt);
    assert.equal(f.orbit.bodyId, 'moon');
    assert.ok(f.orbit.r.distanceTo(r) < 1);
    assert.ok(Math.abs(f.orbit.periapsis - 20000) < 1);
    assert.ok(Math.abs(f.orbit.apoapsis - 20000) < 1);
    assert.equal(f.telemetry.atmosphere.density, 0);
    assert.equal(f.lastThrust, 0);
    assert.equal(f.crashed, false);
    assert.ok(Math.abs(f.orbit.speed - initial.speed) < 0.01);
  } finally {
    f.dispose();
  }
});

test('Lunar separation keeps epoch and moon-relative orbital diagnostics', () => {
  const f = new Flight(preset('twin'), 'moon-orbit', 12345);
  try {
    f.stageNext();
    f.stageNext();
    assert.equal(f.detached.length, 1);
    const child = f.detached[0];
    assert.equal(child.orbit.bodyId, 'moon');
    assert.equal(child.universalTime, 12345);
    f.step(1 / 120);
    assert.equal(child.orbit.bodyId, 'moon');
    assert.equal(f.orbit.bodyId, 'moon');
    assert.equal(child.universalTime, f.universalTime);
    assert.ok(child.orbit.speed < 1000);
  } finally {
    f.dispose();
  }
});

test('A lunar wreck translates with the surface rather than remaining behind in inertial space', () => {
  const f = new Flight(preset('orbiter'), 'moon-orbit', 900);
  try {
    f.crashed = true;
    const before = f.pos.clone().sub(bodyState(MOON, 900).position);
    f.step(2);
    assert.ok(f.pos.clone().sub(bodyState(MOON, 902).position).distanceTo(before) < 1e-8);
  } finally {
    f.dispose();
  }
});
