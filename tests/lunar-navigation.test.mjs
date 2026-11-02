import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {MOON, bodyState, bodyOrbitState, advanceCelestialOrbit} from '../dist/celestial.js';
import {center} from '../dist/planet.js';
import {maneuverPreview} from '../dist/maneuver.js';
import {apsisPlan} from '../dist/orbit-plan.js';
import {orbitSegments} from '../dist/tracking-orbits.js';
import {createManeuverNode, validateManeuverNode} from '../dist/maneuver-node.js';
test('Lunar future burn follows the moon and agrees with coast integration', () => {
  const epoch = 30000,
    b = bodyState(MOON, epoch),
    rp = 220000,
    ra = 400000,
    a = (rp + ra) / 2;
  let pos = b.position.clone().add(new T.Vector3(0, rp, 0)),
    vel = b.velocity.clone().add(new T.Vector3(0, 0, Math.sqrt(MOON.mu * (2 / rp - 1 / a))));
  const original = bodyOrbitState(pos, vel, epoch),
    dv = apsisPlan(original).apoapsis.deltaV,
    preview = maneuverPreview(pos, vel, 'apoapsis', dv, epoch);
  assert.ok(preview.orbit.eccentricity < 1e-10);
  assert.ok(Math.abs(preview.orbit.altitude - 200000) < 1e-7);
  let elapsed = 0;
  while (elapsed < preview.time) {
    const dt = Math.min(0.2, preview.time - elapsed),
      next = advanceCelestialOrbit(pos, vel, new T.Vector3(), dt, epoch + elapsed);
    pos = next.pos;
    vel = next.vel;
    elapsed += dt;
  }
  assert.ok(pos.distanceTo(preview.burnPos) < 1);
  assert.ok(vel.distanceTo(preview.burnVel) < 0.01);
  const node = createManeuverNode(preview, 100);
  assert.equal(validateManeuverNode(node).universalTime, epoch + preview.time);
  assert.throws(() => validateManeuverNode({...node, universalTime: NaN}));
});
test('Lunar tracking geometry has a common parent origin and is clipped at the lunar sphere', () => {
  const time = 80000,
    b = bodyState(MOON, time),
    offset = b.position.clone().sub(center),
    radius = 220000,
    pos = b.position.clone().add(new T.Vector3(0, radius, 0)),
    vel = b.velocity.clone().add(new T.Vector3(0, 0, Math.sqrt(MOON.mu / radius)));
  const segments = orbitSegments(pos, vel, {time});
  assert.equal(segments.length, 720);
  for (const p of segments.flat())
    assert.ok(Math.abs(new T.Vector3(...p).sub(offset).length() - radius) < 1e-6);
  const escape = orbitSegments(pos, b.velocity.clone().add(vel.clone().sub(b.velocity).multiplyScalar(2)), {
    time
  });
  assert.ok(escape.length > 0);
  for (const p of escape.flat())
    assert.ok(new T.Vector3(...p).sub(offset).length() <= MOON.sphereOfInfluence);
});
