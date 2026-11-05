import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {PRIMARY, MOON} from '../dist/celestial.js';
import {
  fixedToInertial,
  launchSiteOrientation,
  overWater,
  PRIMARY_ROTATION_PERIOD
} from '../dist/surface-frame.js';
import {Flight} from '../dist/core.js';
import {preset, PARTS} from '../dist/catalog.js';
import {availableEngineForce} from '../dist/descent.js';
import {engineIsp, engineMaxThrust} from '../dist/resources.js';
import {atmosphere} from '../dist/planet.js';
import {engineMedium} from '../dist/engine-medium.js';
import {engineState, setPartAction} from '../dist/part-actions.js';
import {partCenter} from '../dist/aero.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
test('Jet reports absent atmosphere on planetary and lunar orbits without consuming fuel', () => {
  for (const env of ['orbit', 'moon-orbit']) {
    const f = new Flight(preset('plane'), env);
    try {
      const p = f.parts.find(p => PARTS[p.type].thrustMedium === 'air'),
        fuel = [...f.fuel];
      setPartAction(f, p.id, 'engine', true);
      f.throttle = 1;
      f.step(1 / 120);
      assert.equal(engineState(f, p.id).status, '大気なし');
      assert.equal(f.engineThrust.get(p.id) || 0, 0);
      assert.deepEqual([...f.fuel], fuel);
      setPartAction(f, p.id, 'engine', false);
      assert.equal(engineState(f, p.id).status, '停止中');
    } finally {
      f.dispose();
    }
  }
  const f = new Flight(preset('plane'), 'runway');
  try {
    const p = f.parts.find(p => PARTS[p.type].thrustMedium === 'air');
    setPartAction(f, p.id, 'engine', true);
    f.throttle = 0.3;
    f.step(1 / 120);
    assert.ok(f.engineThrust.get(p.id) > 0);
    assert.equal(engineState(f, p.id).status, '燃焼中');
  } finally {
    f.dispose();
  }
});
test('Propeller readout follows actual immersion force and clears when stopped', () => {
  const f = new Flight(preset('boat'), 'water');
  let loaded;
  try {
    const p = f.parts.find(p => PARTS[p.type].thrustMedium === 'water');
    f.sas = false;
    f.omega.set(0, 0, 0);
    setPartAction(f, p.id, 'engine', true);
    f.throttle = 0.5;
    for (const [height, fraction] of [
      [-0.2, 1],
      [-0.025, 0.5],
      [0.2, 0]
    ]) {
      f.q.identity();
      const seaPoint = new Vector3(0, PRIMARY.radius + height, 0).applyQuaternion(
        launchSiteOrientation('water')
      );
      f.pos.copy(fixedToInertial(seaPoint, f.universalTime)).sub(partCenter(p));
      f.vel.set(0, 0, 0);
      const expected = engineMedium(f, p).submersion;
      assert.ok(Math.abs(expected - fraction) < 0.001);
      f.step(1 / 120);
      assert.ok(Math.abs((f.engineThrust.get(p.id) || 0) - 3000 * expected) < 0.01);
      assert.ok(Math.abs(f.lastThrust - 3000 * expected) < 0.01);
      assert.equal(engineState(f, p.id).status, fraction ? '推進中' : '水中でのみ作動');
    }
    loaded = loadFlight(saveFlight(f));
    loaded.step(1 / 120);
    assert.equal(engineState(loaded, p.id).status, '水中でのみ作動');
    setPartAction(f, p.id, 'engine', false);
    f.step(1 / 120);
    assert.equal(f.engineThrust.get(p.id) || 0, 0);
    assert.equal(engineState(f, p.id).status, '停止中');
  } finally {
    loaded?.dispose();
    f.dispose();
  }
  const f2 = new Flight(preset('boat'), 'orbit');
  try {
    const p = f2.parts.find(p => PARTS[p.type].thrustMedium === 'water');
    setPartAction(f2, p.id, 'engine', true);
    f2.throttle = 1;
    f2.step(1 / 120);
    assert.equal(f2.lastThrust, 0);
    assert.equal(engineState(f2, p.id).status, '水中でのみ作動');
  } finally {
    f2.dispose();
  }
});

test('sea geography follows the rotating planet and propeller position regardless of departure', () => {
  for (const time of [0, PRIMARY_ROTATION_PERIOD / 4]) {
    const f = new Flight(preset('boat'), 'land', time);
    try {
      const p = f.parts.find(p => PARTS[p.type].thrustMedium === 'water');
      for (const [site, wet] of [
        ['land', false],
        ['runway', false],
        ['water', true]
      ]) {
        const fixed = new Vector3(0, PRIMARY.radius - 1, 0).applyQuaternion(launchSiteOrientation(site));
        const point = fixedToInertial(fixed, time);
        assert.equal(overWater(point, time), wet);
        f.pos.copy(point).sub(partCenter(p).applyQuaternion(f.q));
        assert.equal(engineMedium(f, p).submersion, wet ? 1 : 0);
        assert.equal(
          overWater(fixedToInertial(fixed.clone().normalize().multiplyScalar(MOON.radius), time, MOON), time),
          false
        );
      }
    } finally {
      f.dispose();
    }
  }
});

test('jet intake exposure scales actual thrust, fuel use and predicted force together', () => {
  for (const [height, exposure] of [
    [1, 1],
    [-0.025, 0.5],
    [-1, 0]
  ]) {
    const f = new Flight(preset('plane'), 'runway');
    try {
      const jet = f.parts.find(p => PARTS[p.type].thrustMedium === 'air');
      setPartAction(f, jet.id, 'engine', true);
      f.throttle = 1;
      const point = new Vector3(0, PRIMARY.radius + height, 0).applyQuaternion(
        launchSiteOrientation('water')
      );
      f.pos.copy(fixedToInertial(point, f.universalTime)).sub(partCenter(jet).applyQuaternion(f.q));
      const air = atmosphere(f.pos.length() - PRIMARY.radius);
      const thrust = ((engineMaxThrust(jet) * air.density) / 1.225) * exposure;
      const totalFuel = () => [...f.fuel.values()].reduce((a, b) => a + b, 0);
      const before = totalFuel();
      assert.ok(Math.abs(availableEngineForce(f, air.density, air.pressure).length() - thrust) < 0.01);
      if (!exposure) assert.equal(engineState(f, jet.id).status, '吸気口が水没');
      f.step(1 / 120);
      assert.ok(Math.abs(f.engineThrust.get(jet.id) - thrust) < 0.01);
      assert.ok(Math.abs(before - totalFuel() - thrust / (120 * engineIsp(jet, air.pressure) * 9.81)) < 1e-7);
    } finally {
      f.dispose();
    }
  }
});
