import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {advanceCoastFleet} from '../dist/coast-flight.js';
import {advanceCelestialOrbit} from '../dist/celestial.js';
import {maneuverPreview} from '../dist/maneuver.js';

const center = f => f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));
for (const site of ['orbit', 'moon-orbit', 'transfer']) {
  const epoch = 40000,
    duration = site === 'transfer' ? 45 : 120;
  const flight = new Flight(preset('orbiter'), site, epoch);
  try {
    const position = center(flight),
      velocity = flight.vel.clone();
    const predict = () => maneuverPreview(position, velocity, {universalTime: epoch + duration}, 0, epoch);
    const preview = predict();
    // Independent fixed-step integrator, evaluated at the expected stop epoch.
    let pos = position.clone(),
      vel = velocity.clone();
    const zero = new Vector3(),
      h = 0.25;
    for (let i = 0; i < duration / h; i++) {
      const step = advanceCelestialOrbit(pos, vel, zero, h, epoch + i * h);
      pos = step.pos;
      vel = step.vel;
    }
    const coast = advanceCoastFleet(flight, 120);
    assert.equal(coast.reason, site === 'transfer' ? '予定噴射の直前' : null);
    assert.ok(Math.abs(coast.advanced - duration) < 1e-8);
    const epochError = Math.abs(flight.universalTime - preview.universalTime);
    assert.ok(epochError < 1e-8);
    const separation = center(flight).distanceTo(preview.burnPos);
    const speedDifference = flight.vel.distanceTo(preview.burnVel);
    const referencePositionError = pos.distanceTo(preview.burnPos);
    const referenceVelocityError = vel.distanceTo(preview.burnVel);
    assert.ok(separation < 0.001 && speedDifference < 0.00001);
    assert.ok(referencePositionError < 1 && referenceVelocityError < 0.01);
    const samples = [];
    for (let trial = 0; trial < 9; trial++) {
      const start = performance.now();
      for (let i = 0; i < 1000; i++) predict();
      if (trial >= 2) samples.push(performance.now() - start);
    }
    console.log({
      site,
      epoch,
      duration,
      coastSteps: coast.steps,
      epochError,
      separation,
      speedDifference,
      referencePositionError,
      referenceVelocityError,
      previewMsPer1000: samples.sort((a, b) => a - b)[3]
    });
  } finally {
    flight.dispose();
  }
}
