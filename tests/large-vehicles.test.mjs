import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {PARTS, preset, nodes} from '../dist/catalog.js';
import {Flight, validateCraft, statistics} from '../dist/core.js';
import {bodyAltitude, bodyUp} from '../dist/celestial.js';
import {surfaceRelativeVelocity} from '../dist/surface-frame.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import {buoyancyBalance} from '../dist/buoyancy.js';
import {symmetryPlacementPoses} from '../dist/placement-poses.js';

test('large vehicle parts retain attachment origins, mirror poses and independent craft settings', () => {
  assert.deepEqual(nodes('wingLarge'), [
    [-3, 0, 0, -1, 0, 0],
    [3, 0, 0, 1, 0, 0]
  ]);
  const poses = symmetryPlacementPoses(
    new T.Vector3(2, 0, 0),
    new T.Quaternion(),
    'mirror',
    'sph',
    'wingLarge'
  );
  assert.ok(new T.Vector3(1, 0, 0).applyQuaternion(poses[1].q).x < -0.99);
  for (const kind of ['plane-large', 'boat-large', 'sub-large']) {
    const craft = preset(kind);
    assert.deepEqual(validateCraft(JSON.parse(JSON.stringify({version: 1, parts: craft}))), craft);
    assert.ok(craft.every(p => PARTS[p.type]));
    assert.ok(statistics(craft).mass > 20000);
  }
  assert.equal(preset('plane-large').filter(p => p.type === 'jetLarge').length, 2);
  assert.equal(PARTS.cockpit.mass, 510);
  assert.equal(PARTS.wing.wing, 2.1);
});
test('large twin jet departs normally with both engines and restores airborne state', () => {
  for (const epoch of [0, 159542]) {
    let f = new Flight(preset('plane-large'), 'runway', epoch);
    try {
      f.stageNext();
      f.throttle = 1;
      for (let i = 0; i < 35 * 120; i++) f.step(1 / 120, {pitch: i > 10 * 120 ? -1 : 0});
      assert.ok(f.orbit.altitude > 100);
      assert.ok(f.orbit.vertical > 5);
      assert.equal(f.telemetry.contacts, 0);
      assert.equal(f.crashed, false);
      for (const e of f.parts.filter(p => PARTS[p.type].thrustMedium === 'air'))
        assert.ok(f.engineThrust.get(e.id) > 0);
      assert.ok(f.fuelRatio < 1);
      const old = f,
        restored = loadFlight(saveFlight(f));
      f = restored;
      assert.ok(f.pos.distanceTo(old.pos) < 1e-5);
      old.dispose();
      assert.equal(f.parts.length, 17);
      assert.equal(f.rocketAxes, false);
    } finally {
      f.dispose();
    }
  }
});
test('large catamaran floats and its powered gimbal turns without reaction wheels', () => {
  const f = new Flight(preset('boat-large'), 'water');
  try {
    f.stageNext();
    f.throttle = 0.6;
    f.sas = false;
    for (let i = 0; i < 30 * 120; i++) f.step(1 / 120);
    assert.ok(surfaceRelativeVelocity(f.pos, f.vel, f.universalTime).length() > 2);
    const before = f.q.clone();
    for (let i = 0; i < 20 * 120; i++) f.step(1 / 120, {yaw: 1});
    assert.ok(before.angleTo(f.q) > 0.05);
    assert.ok([...f.gimbals.values()].some(g => g.length() > 0.1));
    assert.ok(new T.Vector3(0, 1, 0).applyQuaternion(f.q).dot(bodyUp(f.pos, f.universalTime)) > 0.9);
    assert.equal(f.crashed, false);
    assert.ok(!f.parts.some(p => PARTS[p.type].reactionTorque));
  } finally {
    f.dispose();
  }
});
test('large submarine has ballast authority and survives dive, save and resurfacing', () => {
  const craft = preset('sub-large');
  assert.ok(buoyancyBalance(craft, 0).mass < buoyancyBalance(craft, 0).displacement);
  assert.ok(buoyancyBalance(craft, 1).mass > buoyancyBalance(craft, 1).displacement);
  let f = new Flight(craft, 'water');
  f.sas = false;
  try {
    for (const [ballast, seconds] of [
      [0, 30],
      [1, 60],
      [0, 60]
    ]) {
      f.ballast = ballast;
      for (let i = 0; i < seconds * 120; i++) {
        f.step(1 / 120);
        assert.ok(new T.Vector3(0, 1, 0).applyQuaternion(f.q).dot(bodyUp(f.pos, f.universalTime)) > 0.9);
      }
      if (ballast) {
        assert.ok(bodyAltitude(f.pos, f.universalTime) < -5);
        const loaded = loadFlight(saveFlight(f));
        f.dispose();
        f = loaded;
      } else assert.ok(Math.abs(bodyAltitude(f.pos, f.universalTime)) < 2);
      assert.equal(f.crashed, false);
    }
  } finally {
    f.dispose();
  }
});

test('large landing gear keeps its physical radius through saves and brakes a taxi run', () => {
  for (const kind of ['plane', 'plane-large']) {
    let f = new Flight(preset(kind), 'runway');
    try {
      for (const p of f.parts.filter(p => PARTS[p.type].wheel))
        assert.ok(Math.abs(f.colliders.get(p.id).radius() - PARTS[p.type].size[1] / 2) < 1e-6);
      f.stageNext();
      f.throttle = 0.45;
      for (let i = 0; i < 8 * 120; i++) f.step(1 / 120);
      assert.ok(surfaceRelativeVelocity(f.pos, f.vel, f.universalTime).length() > 3);
      assert.ok(f.telemetry.contacts > 0);
      const restored = loadFlight(saveFlight(f));
      f.dispose();
      f = restored;
      for (const p of f.parts.filter(p => PARTS[p.type].wheel))
        assert.ok(Math.abs(f.colliders.get(p.id).radius() - PARTS[p.type].size[1] / 2) < 1e-6);
      f.throttle = 0;
      f.brake = true;
      for (let i = 0; i < 20 * 120; i++) f.step(1 / 120);
      assert.ok(surfaceRelativeVelocity(f.pos, f.vel, f.universalTime).length() < 0.8);
      assert.equal(f.crashed, false);
      assert.ok(f.telemetry.contacts >= 3);
    } finally {
      f.dispose();
    }
  }
});

test('large submarine can dive under full propulsion without pitching back to the surface', () => {
  for (const epoch of [0, 160378.2]) {
    const f = new Flight(preset('sub-large'), 'water', epoch);
    f.sas = false;
    try {
      for (let i = 0; i < 19 * 120; i++) f.step(1 / 120);
      f.ballast = 1;
      f.stageNext();
      f.throttle = 1;
      for (let i = 0; i < 60 * 120; i++) f.step(1 / 120);
      assert.ok(f.orbit.altitude < -7, `powered dive altitude ${f.orbit.altitude}`);
      assert.ok(new T.Vector3(0, 1, 0).applyQuaternion(f.q).dot(bodyUp(f.pos, f.universalTime)) > 0.98);
      assert.ok(surfaceRelativeVelocity(f.pos, f.vel, f.universalTime).length() > 1);
      assert.equal(f.crashed, false);
    } finally {
      f.dispose();
    }
  }
});
