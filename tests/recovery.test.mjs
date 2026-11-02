import {surfaceRelativeVelocity} from '../dist/surface-frame.js';
const surfaceSpeed = f =>
  surfaceRelativeVelocity(
    f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),
    f.vel,
    f.universalTime
  ).length();
import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {parachuteStep} from '../dist/recovery.js';
import {LaunchPilot} from '../dist/launch-pilot.js';
import {ReturnPilot} from '../dist/return-pilot.js';
test('Parachute waits in vacuum and at unsafe speed, reefs then opens and collapses after touchdown', () => {
  const state = {status: 'armed', fraction: 0};
  for (const env of [
    {altitude: 80000, speed: 2200, vertical: -5, density: 0},
    {altitude: 1000, speed: 400, vertical: -100, density: 1}
  ])
    parachuteStep(state, env, 1);
  assert.equal(state.status, 'armed');
  parachuteStep(state, {altitude: 4000, speed: 200, vertical: -100, density: 0.8}, 1);
  assert.equal(state.status, 'reefed');
  assert.equal(state.fraction, 0.08);
  parachuteStep(state, {altitude: 1000, speed: 50, vertical: -50, density: 1}, 3);
  assert.equal(state.status, 'open');
  assert.equal(state.fraction, 1);
  parachuteStep(state, {landed: true}, 1);
  assert.equal(state.fraction, 0);
});
test('A stowed chute remains available after waiting on the launch pad', () => {
  const f = new Flight(preset('returner'), 'land');
  for (let i = 0; i < 240; i++) f.step(1 / 120);
  assert.ok([...f.chutes.values()].every(c => c.status === 'stowed'));
  f.armParachutes();
  assert.ok([...f.chutes.values()].every(c => c.status === 'armed'));
  f.dispose();
});
test('Pioneer Return completes launch, orbital insertion, deorbit, capsule separation and intact landing', () => {
  const f = new Flight(preset('returner'), 'land'),
    launch = new LaunchPilot();
  for (let i = 0; i < 500 * 120 && !launch.done && !f.crashed; i++) {
    launch.update(f);
    f.step(1 / 120);
  }
  assert.ok(launch.done, 'orbit reached');
  assert.ok(f.orbit.stable);
  const pilot = new ReturnPilot();
  let reefed = false,
    opened = false;
  for (let i = 0; i < 2500 * 60 && !pilot.done && !f.crashed; i++) {
    pilot.update(f);
    f.step(1 / 60);
    reefed ||= [...f.chutes.values()].some(c => c.status === 'reefed');
    opened ||= [...f.chutes.values()].some(c => c.status === 'open');
  }
  assert.ok(pilot.done);
  assert.ok(f.landed);
  assert.equal(f.crashed, false);
  assert.equal(f.parts.length, 3);
  assert.ok(reefed && opened);
  assert.ok(surfaceSpeed(f) < 0.8);
  f.dispose();
});

test('Drop-test preset starts at 1 km and lands after arming its parachute', () => {
  const f = new Flight(preset('recovery'), 'drop');
  f.armParachutes();
  f.step(1 / 120);
  assert.ok(f.orbit.altitude > 990 && f.orbit.altitude < 1000);
  for (let i = 0; i < 200 * 120 && !f.landed && !f.crashed; i++) f.step(1 / 120);
  assert.ok(f.landed);
  assert.equal(f.crashed, false);
  f.dispose();
});
