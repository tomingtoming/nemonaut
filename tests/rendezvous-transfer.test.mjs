import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {rendezvousTransfer} from '../dist/rendezvous-transfer.js';
import {maneuverPreview} from '../dist/maneuver.js';
import {bodyOrbitState} from '../dist/celestial.js';
import {keplerDrift} from '../dist/coast-orbit.js';
import {PLANET, center} from '../dist/planet.js';
const radius = 800000,
  speed = Math.sqrt(PLANET.mu / radius),
  epoch = 100,
  p = center.clone().add(new T.Vector3(0, radius, 0)),
  v = new T.Vector3(0, 0, speed),
  axis = new T.Vector3(1, 0, 0);
const own = bodyOrbitState(p, v, epoch),
  target = bodyOrbitState(
    p.clone().sub(center).applyAxisAngle(axis, 0.03).add(center),
    v.clone().applyAxisAngle(axis, 0.03),
    epoch
  );
test('Transfer reaches the moving target offset at a shared epoch and reports uncancelled arrival velocity', () => {
  const before = target.r.clone(),
    plan = rendezvousTransfer(own, target),
    preview = maneuverPreview(p, v, {universalTime: plan.epoch}, plan.components, epoch);
  const a = keplerDrift(preview.orbit.r, preview.orbit.relativeVelocity, PLANET.mu, plan.duration),
    b = keplerDrift(target.r, target.relativeVelocity, PLANET.mu, plan.arrivalTime - epoch);
  assert.ok(Math.abs(a.position.distanceTo(b.position) - 100) < 0.01);
  assert.ok(Math.abs(a.velocity.distanceTo(b.velocity) - plan.arrivalSpeed) < 1e-6);
  assert.ok(plan.arrivalSpeed > 1);
  assert.equal(plan.epoch, 220);
  assert.ok(preview.orbit.stable);
  assert.deepEqual(target.r, before);
});
test('Transfer rejects impossible timing, wrong body and unsafe starting orbits', () => {
  for (const options of [{duration: 0}, {duration: 7201}, {preparation: 0}, {duration: NaN}])
    assert.throws(() => rendezvousTransfer(own, target, options));
  assert.throws(() => rendezvousTransfer(own, {...target, bodyId: 'moon'}));
  assert.throws(() => rendezvousTransfer({...own, stable: false}, target));
  assert.throws(() => rendezvousTransfer(own, {...target, universalTime: 101}));
});
