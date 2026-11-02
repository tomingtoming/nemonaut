import {bodyAltitude} from '../dist/celestial.js';
import {surfaceRelativeVelocity, inertialToFixed} from '../dist/surface-frame.js';
const surfaceSpeed = f =>
  surfaceRelativeVelocity(
    f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),
    f.vel,
    f.universalTime
  ).length();
import test from 'node:test';
import assert from 'node:assert/strict';
import {PARTS, preset, part} from '../dist/catalog.js';
import {Flight, statistics, validateCraft, descendants} from '../dist/core.js';
const run = (f, seconds, input = () => ({}), hz = 120) => {
  for (let i = 0; i < seconds * hz; i++) f.step(1 / hz, input(i / hz));
  return f;
};
test('All six blueprints roundtrip with a single connected root', () => {
  for (const k of ['rocket', 'orbiter', 'plane', 'rover', 'boat', 'sub']) {
    const p = preset(k);
    assert.equal(
      JSON.stringify(validateCraft(JSON.parse(JSON.stringify({version: 1, parts: p})))),
      JSON.stringify(p)
    );
    assert.equal(p.filter(x => !x.parent).length, 1);
    assert.equal(descendants(p, p[0].id).size, p.length);
  }
});
test('Malformed craft, unknown parts and cycles are rejected', () => {
  const p = preset('rocket');
  p[0].parent = p[1].id;
  assert.throws(() => validateCraft({version: 1, parts: p}));
  p[0].parent = null;
  p[1].p[0] = Infinity;
  assert.throws(() => validateCraft({version: 1, parts: p}));
  p[1].p[0] = 0;
  p[1].type = 'not-a-part';
  assert.throws(() => validateCraft({version: 1, parts: p}));
});
test('Rocket lifts off, burns fuel and remains upright with symmetric fins', () => {
  const f = new Flight(preset('rocket'), 'land');
  f.throttle = 1;
  f.stageNext();
  run(f, 10);
  assert.ok(f.pos.y > 200);
  assert.ok(f.fuelRatio < 0.95 && f.fuelRatio > 0.85);
  assert.ok(Math.abs(f.pos.x) < 0.01);
  assert.equal(f.crashed, false);
});
test('No fuel tank means no liquid engine thrust', () => {
  const p = preset('rocket').filter(p => p.type !== 'tank');
  const f = new Flight(p, 'land');
  f.stageNext();
  f.throttle = 1;
  run(f, 3);
  assert.equal(f.lastThrust, 0);
});
test('Cutoff stops thrust and gravity slows a climbing rocket', () => {
  const f = new Flight(preset('rocket'), 'land');
  f.throttle = 1;
  f.stageNext();
  run(f, 5);
  const v = f.vel.y;
  f.throttle = 0;
  run(f, 1);
  assert.equal(f.lastThrust, 0);
  assert.ok(f.vel.y < v);
});
test('Plane takes off with a brief nose-up input, then SAS holds flight', () => {
  const f = new Flight(preset('plane'), 'runway');
  f.throttle = 1;
  f.stageNext();
  run(f, 60, t => (t > 30 && t < 32 ? {pitch: -1} : {}));
  assert.ok(f.orbit.altitude > 100);
  assert.ok(f.vel.z > 40);
  assert.equal(f.crashed, false);
});
test('Rover moves on wheels and brakes without fuel', () => {
  const f = new Flight(preset('rover'), 'land');
  f.throttle = 1;
  f.stageNext();
  run(f, 10);
  assert.ok(inertialToFixed(f.pos, f.universalTime).z > 30);
  const speed = surfaceSpeed(f);
  f.throttle = 0;
  f.brake = true;
  run(f, 3);
  assert.ok(surfaceSpeed(f) < speed * 0.2);
  assert.equal(f.fuelRatio, 1);
});
test('Boat floats and its submerged propeller drives it forward', () => {
  const f = new Flight(preset('boat'), 'water');
  f.throttle = 1;
  f.stageNext();
  run(f, 30);
  assert.ok(inertialToFixed(f.pos, f.universalTime).z > 70);
  assert.ok(bodyAltitude(f.pos, f.universalTime) > -1 && bodyAltitude(f.pos, f.universalTime) < 1);
  assert.equal(f.crashed, false);
});
test('Ballast changes a submarine from floating to sinking, pumping out reverses it', () => {
  const f = new Flight(preset('sub'), 'water');
  run(f, 15);
  assert.ok(bodyAltitude(f.pos, f.universalTime) > -1);
  f.ballast = 1;
  run(f, 25);
  assert.ok(bodyAltitude(f.pos, f.universalTime) < -2);
  const depth = bodyAltitude(f.pos, f.universalTime);
  f.ballast = 0;
  run(f, 15);
  assert.ok(bodyAltitude(f.pos, f.universalTime) > depth + 1);
});
test('Staging removes only the branch beneath a decoupler', () => {
  const a = part('capsule'),
    b = part('decoupler', [0, -1, 0], [0, 0, 0], a.id, 1),
    c = part('tank', [0, -2, 0], [0, 0, 0], b.id),
    d = part('solar', [1, 0, 0], [0, 0, 0], a.id);
  const f = new Flight([a, b, c, d], 'land');
  assert.equal(f.stageNext().size, 0);
  assert.equal(f.stageNext().size, 2);
  assert.deepEqual(
    f.parts.map(p => p.type),
    ['capsule', 'solar']
  );
});
test('Flight is stable across fixed step sizes', () => {
  const fs = [60, 120].map(hz => {
    const f = new Flight(preset('rocket'), 'land');
    f.throttle = 1;
    f.stageNext();
    return run(f, 10, () => ({}), hz);
  });
  assert.ok(Math.abs(fs[0].pos.y - fs[1].pos.y) < 1);
});
