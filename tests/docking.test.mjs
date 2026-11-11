import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Flight, validateCraft} from '../dist/core.js';
import {part, preset} from '../dist/catalog.js';
import {
  portPose,
  dockingStatus,
  combinedMotion,
  dockVessels,
  undockVessel,
  inertiaAbout
} from '../dist/docking.js';
import {centerOfVessel, setTarget} from '../dist/relative-navigation.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
function vessel() {
  const core = part('probe'),
    port = part('dockingPort', [0, 0.321, 0], [0, 0, 0], core.id);
  return new Flight([core, port], 'orbit');
}
function pair() {
  const a = vessel(),
    b = vessel();
  a.q.identity();
  b.q.setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI);
  a.pos.set(0, 80000, 0);
  b.pos.set(0, 80000 + 0.884, 0);
  a.vel.set(0, 0, 0);
  b.vel.set(0, 0, 0);
  return [a, b, a.parts[1].id, b.parts[1].id];
}
test('Vessels from land, runway and sea departures dock by port geometry and stay where they are', () => {
  for (const [own, other] of [
    ['land', 'runway'],
    ['runway', 'water'],
    ['water', 'land']
  ]) {
    const [a, b, ai, bi] = pair();
    a.environment = own;
    b.environment = other;
    a.detached = [b];
    assert.equal(dockingStatus(a, ai, b, bi).ready, true);
    const poses = new Map(
      [a, b].flatMap(v => v.parts.map(p => [p.id, new T.Vector3(...p.p).applyQuaternion(v.q).add(v.pos)]))
    );
    // The combined vessel is rebuilt as a new flight of the root's departure environment.
    const merged = dockVessels(a, b, ai, bi);
    try {
      assert.equal(merged.environment, own);
      for (const p of merged.parts)
        assert.ok(
          new T.Vector3(...p.p).applyQuaternion(merged.q).add(merged.pos).distanceTo(poses.get(p.id)) < 1e-9,
          own + ': ' + p.type
        );
    } finally {
      merged.dispose();
    }
  }
  const [a, b, ai, bi] = pair();
  b.pos.x += 1;
  assert.match(dockingStatus(a, ai, b, bi).reason, /離れ/);
  a.dispose();
  b.dispose();
});
test('Opposed stationary mating faces qualify; distance and facing prevent false docking', () => {
  const [a, b, ai, bi] = pair();
  assert.ok(dockingStatus(a, ai, b, bi).ready);
  b.pos.x = 0.2;
  assert.match(dockingStatus(a, ai, b, bi).reason, /離れ/);
  b.pos.x = 0;
  b.q.identity();
  b.pos.copy(a.pos);
  assert.match(dockingStatus(a, ai, b, bi).reason, /向き合/);
  assert.equal(dockingStatus(a, ai, a, ai).ready, false);
  a.dispose();
  b.dispose();
});
test('Docking speed is measured at moving port faces, not only vessel centers', () => {
  const [a, b, ai, bi] = pair();
  b.vel.x = 0.4;
  assert.match(dockingStatus(a, ai, b, bi).reason, /速度/);
  b.vel.x = 0;
  b.omega.z = 2;
  assert.ok(portPose(b, bi).velocity.length() > 0.3);
  assert.equal(dockingStatus(a, ai, b, bi).ready, false);
  b.omega.z = 0;
  b.crashed = true;
  assert.equal(dockingStatus(a, ai, b, bi).ready, false);
  a.dispose();
  b.dispose();
});
test('Occupied ports and non-port IDs cannot qualify', () => {
  const [a, b, ai, bi] = pair();
  a.parts[1].dockPartner = 'occupied';
  assert.match(dockingStatus(a, ai, b, bi).reason, /使用中/);
  assert.equal(dockingStatus(a, a.parts[0].id, b, bi).ready, false);
  a.dispose();
  b.dispose();
});
test('Combining rigidly moving vessels preserves common translation and angular motion', () => {
  const [a, b] = pair(),
    omega = new T.Vector3(0.1, 0.2, -0.3),
    velocity = new T.Vector3(4, -2, 7),
    center = centerOfVessel(a).add(centerOfVessel(b)).multiplyScalar(0.5);
  for (const v of [a, b]) {
    v.omega.copy(omega);
    v.vel.copy(velocity).add(omega.clone().cross(centerOfVessel(v).sub(center)));
  }
  const motion = combinedMotion(a, b);
  assert.ok(motion.velocity.distanceTo(velocity) < 1e-10);
  assert.ok(motion.omega.distanceTo(omega) < 1e-9);
  assert.ok(motion.center.distanceTo(center) < 1e-9);
  a.dispose();
  b.dispose();
});
test('Equal opposite linear and spin momenta cancel without inventing merged motion', () => {
  const [a, b] = pair();
  a.vel.set(0, 0.1, 0);
  b.vel.set(0, -0.1, 0);
  a.omega.set(0, 0.1, 0);
  b.omega.set(0, -0.1, 0);
  const motion = combinedMotion(a, b);
  assert.ok(motion.velocity.length() < 1e-10);
  assert.ok(motion.omega.length() < 1e-10);
  a.dispose();
  b.dispose();
});
test('Docking reroots incoming parts without moving them and conserves momentum and resources', () => {
  const [a, b, ai, bi] = pair();
  b.environment = 'water';
  a.detached = [b];
  a.vel.set(0.03, 0, 0.02);
  b.vel.set(-0.02, 0, 0.01);
  a.omega.y = 0.03;
  b.omega.y = -0.02;
  a.charge.set(a.parts[0].id, 17);
  b.charge.set(b.parts[0].id, 43);
  setTarget(a, a, b);
  const poses = new Map(
      [a, b].flatMap(v => v.parts.map(p => [p.id, new T.Vector3(...p.p).applyQuaternion(v.q).add(v.pos)]))
    ),
    motion = combinedMotion(a, b),
    merged = dockVessels(a, b, ai, bi);
  assert.equal(merged.parts.length, 4);
  assert.equal(merged.detached.length, 0);
  assert.equal(merged.targetPartId, null);
  assert.equal(merged.parts.filter(p => !p.parent).length, 1);
  validateCraft({version: 1, parts: merged.parts});
  for (const p of merged.parts)
    assert.ok(
      new T.Vector3(...p.p).applyQuaternion(merged.q).add(merged.pos).distanceTo(poses.get(p.id)) < 1e-9
    );
  assert.ok(merged.vel.clone().multiplyScalar(merged.stats.mass).distanceTo(motion.momentum) < 1e-9);
  assert.ok(
    merged.omega
      .clone()
      .applyMatrix3(inertiaAbout(merged, centerOfVessel(merged)))
      .distanceTo(motion.angularMomentum) < 1e-8
  );
  assert.deepEqual([...merged.charge.values()], [17, 43]);
  assert.equal(merged.throttle, 0);
  merged.dispose();
});
test('Saved docked craft can undock with all resources and rigid body momentum retained', () => {
  const [a, b, ai, bi] = pair();
  a.detached = [b];
  a.omega.set(0, 0.04, 0);
  b.omega.copy(a.omega);
  let merged = dockVessels(a, b, ai, bi);
  const restored = loadFlight(saveFlight(merged));
  merged.dispose();
  const mass = restored.stats.mass,
    linear = restored.vel.clone().multiplyScalar(mass),
    angular = restored.omega.clone().applyMatrix3(inertiaAbout(restored, centerOfVessel(restored))),
    result = undockVessel(restored, ai),
    child = result.detached[0],
    motion = combinedMotion(result, child);
  assert.equal(result.parts.length, 2);
  assert.equal(child.parts.length, 2);
  assert.equal(
    result.parts.some(p => p.dockPartner),
    false
  );
  assert.equal(
    child.parts.some(p => p.dockPartner),
    false
  );
  assert.ok(motion.momentum.distanceTo(linear) < 1e-8);
  assert.ok(motion.angularMomentum.distanceTo(angular) < 1e-8);
  assert.equal(motion.mass, mass);
  assert.ok(result.vel.distanceTo(child.vel) >= 0.099);
  const again = loadFlight(saveFlight(result));
  assert.equal(again.detached.length, 1);
  result.dispose();
  again.dispose();
});
test('Rejected docking leaves original fleet untouched and corrupt saved bonds are rejected', () => {
  const [a, b, ai, bi] = pair();
  a.detached = [b];
  b.pos.x = 3;
  const before = saveFlight(a);
  assert.throws(() => dockVessels(a, b, ai, bi));
  assert.deepEqual(saveFlight(a), before);
  b.pos.x = 0;
  const merged = dockVessels(a, b, ai, bi),
    bad = saveFlight(merged);
  bad.parts.find(p => p.id === ai).dockPartner = 'missing';
  assert.throws(() => loadFlight(bad));
  merged.dispose();
});
test('Docking example roundtrip retains depleted RCS tanks by part ID', () => {
  let f = new Flight(preset('docking'), 'orbit');
  const values = [...f.fuel.keys()].map((id, i) => [id, i + 0.25]);
  f.fuel = new Map(values);
  const port = f.parts.find(p => p.dockPartner);
  f = undockVessel(f, port.id);
  const child = f.detached[0],
    a = f.parts.find(p => p.type === 'dockingPort'),
    b = child.parts.find(p => p.type === 'dockingPort');
  f = dockVessels(f, child, a.id, b.id);
  assert.equal(f.parts.length, 14);
  assert.deepEqual([...f.fuel].sort(), values.sort());
  const restored = loadFlight(saveFlight(f));
  assert.deepEqual([...restored.fuel].sort(), values);
  f.dispose();
  restored.dispose();
});

test('Ship names and mission clocks survive saved docking, elapsed time, either port and redocking', () => {
  for (const side of ['own', 'target']) {
    const [a, b, ai, bi] = pair();
    a.vesselName = 'Station';
    b.vesselName = 'Supply';
    a.universalTime = b.universalTime = 1000;
    a.time = 300;
    b.time = 40;
    a.detached = [b];
    let f = dockVessels(a, b, ai, bi);
    f.universalTime += 20;
    f.time += 20;
    const saved = saveFlight(f);
    f.dispose();
    f = loadFlight(saved);
    f = undockVessel(f, side === 'own' ? ai : bi);
    assert.equal(f.vesselName, 'Station');
    assert.equal(f.time, 320);
    const child = f.detached[0];
    assert.equal(child.vesselName, 'Supply');
    assert.equal(child.time, 60);
    f.vel.set(0, 0, 0);
    child.vel.set(0, 0, 0);
    f = dockVessels(f, child, ai, bi);
    f.universalTime += 10;
    f.time += 10;
    f = undockVessel(f, bi);
    assert.equal(f.time, 330);
    assert.equal(f.detached[0].time, 70);
    assert.equal(f.detached[0].vesselName, 'Supply');
    f.dispose();
  }
});
test('Nested docking keeps each original mission through out-of-order disconnection', () => {
  const [a, b, ai, bi] = pair();
  a.vesselName = 'A';
  b.vesselName = 'B';
  a.universalTime = b.universalTime = 100;
  a.time = 90;
  b.time = 20;
  const extra = part('dockingPort', [2, 0, 0], [0, 0, 0], a.parts[0].id);
  a.parts.push(extra);
  a.thermal.set(extra.id, structuredClone(a.thermal.get(ai)));
  a.detached = [b];
  let ab = dockVessels(a, b, ai, bi);
  const c = vessel();
  c.vesselName = 'C';
  c.universalTime = 100;
  c.time = 5;
  c.q.copy(ab.q).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI));
  const ci = c.parts[1].id;
  c.pos.add(portPose(ab, extra.id).position.sub(portPose(c, ci).position));
  c.vel.copy(ab.vel);
  ab.detached = [c];
  let f = dockVessels(ab, c, extra.id, ci);
  f.universalTime = 110;
  f.time += 10;
  const saved = saveFlight(f);
  f.dispose();
  f = loadFlight(saved);
  f = undockVessel(f, bi);
  assert.equal(f.vesselName, 'A');
  assert.equal(f.detached[0].vesselName, 'B');
  assert.equal(f.detached[0].time, 30);
  f = undockVessel(f, ci);
  assert.equal(f.time, 100);
  assert.deepEqual(
    f.detached.map(v => [v.vesselName, v.time]),
    [
      ['B', 30],
      ['C', 15]
    ]
  );
  f.dispose();
});
test('Corrupt mission provenance is rejected; older docked designs still load', () => {
  const f = new Flight(preset('docking'), 'orbit'),
    saved = saveFlight(f);
  f.dispose();
  for (const missionOrigin of [
    {name: 'x', epoch: NaN},
    {name: 4, epoch: 0},
    {name: 'x', epoch: 1e13}
  ]) {
    const bad = structuredClone(saved);
    bad.parts[0].missionOrigin = missionOrigin;
    assert.throws(() => loadFlight(bad), /ミッション/);
  }
  const old = loadFlight(saved);
  old.dispose();
});

test('docking uses the active probe reference and undocking restores both world frames', () => {
  const [a, b, ai, bi] = pair();
  a.parts[0].referenceDirection = 2;
  b.parts[0].referenceDirection = 1;
  const frame = f => f.q.clone().multiply(f.instrumentRotation);
  const own = frame(a),
    target = frame(b);
  a.detached = [b];
  let flight = a;
  try {
    flight = dockVessels(flight, b, ai, bi);
    assert.ok(frame(flight).angleTo(own) < 1e-6);
    flight = undockVessel(flight, ai);
    assert.ok(frame(flight).angleTo(own) < 1e-6);
    assert.ok(frame(flight.detached[0]).angleTo(target) < 1e-6);
  } finally {
    flight.dispose();
  }
});
test('Docking and undocking keep the separation count, ascent settings and runway end', () => {
  const [a, b, ai, bi] = pair();
  a.detached = [b];
  a.separationCount = 1;
  b.separationCount = 3;
  a.runwayEnd = '27';
  a.orbitalAscentSettings = {altitude: 200000, inclination: 30};
  const merged = dockVessels(a, b, ai, bi);
  assert.equal(merged.separationCount, 3);
  assert.equal(merged.runwayEnd, '27');
  assert.deepEqual(merged.orbitalAscentSettings, {altitude: 200000, inclination: 30});
  const result = undockVessel(merged, ai);
  assert.equal(result.separationCount, 3);
  assert.equal(result.runwayEnd, '27');
  assert.deepEqual(result.orbitalAscentSettings, {altitude: 200000, inclination: 30});
  result.dispose();
});
