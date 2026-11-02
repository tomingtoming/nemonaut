import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight, statistics} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {descentTelemetry, descentGuidance} from '../dist/descent.js';
import {fixedToInertial, surfaceVelocity} from '../dist/surface-frame.js';
import {engineIsp, engineMaxThrust} from '../dist/resources.js';
import {atmosphere} from '../dist/planet.js';
import * as T from 'three';

test('surface descent removes planetary rotation and accounts for pressure and fuel mass', () => {
  for (const time of [0, 74193.2]) {
    const parts = preset('hopper'),
      engine = parts.find(p => p.type === 'engine');
    engine.type = 'engineVacMedium';
    const f = new Flight(parts, 'land', time);
    try {
      f.stageNext();
      const com = f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));
      f.vel.copy(surfaceVelocity(com, time));
      let d = descentTelemetry(f);
      assert.ok(d.horizontal < 1e-8);
      assert.ok(Math.abs(d.vertical) < 1e-8);
      const pressure = atmosphere(com.distanceTo(new T.Vector3(0, -600000, 0)) - 600000).pressure;
      assert.ok(Math.abs(d.thrust - (engineMaxThrust(engine) * engineIsp(engine, pressure)) / 360) < 1e-6);
      assert.ok(d.thrust < 20000, 'vacuum engine has weak sea-level thrust');
      const heavy = d.hoverThrottle;
      for (const id of f.fuel.keys()) f.fuel.set(id, 200);
      f.stats = statistics(f.parts, f.fuel, f.ballast, f.thermal);
      d = descentTelemetry(f);
      assert.ok(d.hoverThrottle < heavy);
      assert.doesNotMatch(descentGuidance(d), /月/);
    } finally {
      f.dispose();
    }
  }
});

test('hover estimate arrests a stationary surface hop without altitude automation', () => {
  const f = new Flight(preset('hopper'), 'land', 74193.2);
  try {
    f.pos.copy(fixedToInertial(new T.Vector3(0, 600300, 0), f.universalTime));
    const com = f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));
    f.vel.copy(surfaceVelocity(com, f.universalTime));
    f.stageNext();
    f.sasMode = 'radial';
    const d = descentTelemetry(f);
    f.throttle = d.hoverThrottle;
    for (let i = 0; i < 120; i++) f.step(1 / 120);
    assert.ok(Math.abs(descentTelemetry(f).vertical) < 0.3);
    assert.equal(f.throttle, d.hoverThrottle, 'estimate is a fixed manual setting');
  } finally {
    f.dispose();
  }
});
