import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {mixRCS, rcsThrusters, burnRCS} from '../dist/rcs.js';
import {Flight, statistics} from '../dist/core.js';
import {preset, part, PARTS} from '../dist/catalog.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import {selectVessel} from '../dist/fleet.js';
const definitions = {rcs: {rcsThrust: 120, rcsIsp: 65}},
  zero = () => new T.Vector3();
const parts = [-1, 1].map((x, i) => ({id: String(i), type: 'rcs', p: [x, 0, 0], r: [0, 0, 0]}));
function result(thrusters, levels) {
  const force = zero(),
    torque = zero();
  thrusters.forEach((t, i) => {
    const f = t.direction.clone().multiplyScalar(t.thrust * levels[i]);
    force.add(f);
    torque.add(t.position.clone().cross(f));
  });
  return {force, torque};
}
test('Symmetric RCS placement creates translation without rotation and rotation without translation', () => {
  const ts = rcsThrusters(parts, definitions);
  for (const axis of [1, 2]) {
    const cmd = zero().setComponent(axis, 1);
    let r = result(ts, mixRCS(ts, zero(), cmd, zero()));
    assert.ok(r.force.length() < 1e-5);
    assert.ok(r.torque.getComponent(axis) > 100);
    r = result(ts, mixRCS(ts, zero(), zero(), cmd));
    assert.ok(r.force.getComponent(axis) > 100);
    assert.ok(r.torque.length() < 1e-5);
  }
});
test('Nozzle layout cannot invent roll torque along its lever arm', () => {
  const ts = rcsThrusters(parts, definitions),
    r = result(ts, mixRCS(ts, zero(), new T.Vector3(1, 0, 0), zero()));
  assert.ok(r.torque.length() < 1e-8);
  assert.ok(r.force.length() < 1e-8);
  assert.deepEqual(mixRCS([], zero(), new T.Vector3(1, 1, 1), zero()), []);
});
test('RCS burn respects impulse, local reservoir depletion and independent supplies', () => {
  const ts = rcsThrusters(parts, definitions),
    levels = ts.map(() => 1),
    fuel = new Map([
      ['0', 0.01],
      ['1', 12]
    ]),
    burn = burnRCS(ts, levels, fuel, 1);
  const impulse = burn.filter(t => t.id === '0').reduce((s, t) => s + t.force.length(), 0);
  assert.ok(Math.abs(impulse - 0.01 * 65 * 9.81) < 1e-8);
  assert.equal(fuel.get('0'), 0);
  assert.ok(Math.abs(fuel.get('1') - (12 - 720 / (65 * 9.81))) < 1e-10);
  assert.ok(
    burnRCS(ts, levels, fuel, 1)
      .filter(t => t.id === '0')
      .every(t => t.force.length() === 0)
  );
});

test('Flight rotates only with enabled fueled RCS and translates with real impulse', () => {
  for (const enabled of [false, true]) {
    const f = new Flight(preset('rcs'), 'orbit');
    f.sas = false;
    f.rcsEnabled = enabled;
    for (let i = 0; i < 120; i++) f.step(1 / 120, {pitch: 1});
    assert.equal(f.omega.length() > 0.01, enabled);
    assert.equal(f.fuelRatio, 1);
    f.dispose();
  }
  const f = new Flight(preset('rcs'), 'orbit'),
    coast = new Flight(f.parts, 'orbit');
  f.sas = false;
  coast.sas = false;
  f.rcsEnabled = true;
  for (let i = 0; i < 120; i++) {
    f.step(1 / 120, {translateX: 1});
    coast.step(1 / 120);
  }
  assert.ok(f.vel.x - coast.vel.x > 0.5);
  assert.ok(f.omega.length() < 0.01);
  for (const id of f.fuel.keys()) f.fuel.set(id, 0);
  f.omega.set(0, 0, 0);
  f.step(1 / 120, {pitch: 1});
  assert.ok(f.omega.length() < 1e-8);
  f.dispose();
  coast.dispose();
});
test('RCS consumption changes total mass and center without burning main fuel', () => {
  const a = preset('orbiter');
  a.push(part('rcs', [3, 1, 0], [0, 0, 0], a[0].id));
  const f = new Flight(a, 'orbit');
  f.sas = false;
  f.reactionEnabled = false;
  f.rcsEnabled = true;
  const before = statistics(f.parts, f.fuel),
    tank = f.parts.find(p => p.type === 'tank');
  for (let i = 0; i < 120; i++) f.step(1 / 120, {translateX: 1});
  const after = statistics(f.parts, f.fuel);
  assert.ok(after.mass < before.mass);
  assert.ok(after.com.x < before.com.x);
  assert.equal(f.fuel.get(tank.id), 1800);
  assert.equal(f.fuelRatio, 1);
  f.dispose();
});
test('Separated RCS reservoirs and ON/OFF persist across control switch and restore', () => {
  const a = preset('twin'),
    cores = a.filter(p => p.type === 'probe');
  for (const core of cores) a.push(part('rcs', [core.p[0] + 1, core.p[1], 0], [0, 0, 0], core.id));
  const f = new Flight(a, 'orbit');
  f.rcsEnabled = true;
  const blocks = f.parts.filter(p => p.type === 'rcs');
  f.fuel.set(blocks[0].id, 3);
  f.fuel.set(blocks[1].id, 7);
  f.stageNext();
  f.stageNext();
  const child = f.detached[0];
  assert.equal(child.fuel.get(blocks[1].id), 7);
  assert.equal(f.fuel.has(blocks[1].id), false);
  const active = selectVessel(f, child),
    saved = saveFlight(active),
    g = loadFlight(saved);
  assert.equal(g.rcsEnabled, true);
  assert.equal(g.fuel.get(blocks[1].id), 7);
  assert.equal(g.detached[0].fuel.get(blocks[0].id), 3);
  saved.fuel.find(([id]) => id === blocks[1].id)[1] = 13;
  assert.throws(() => loadFlight(saved));
  const old = saveFlight(active);
  delete old.rcsEnabled;
  const migrated = loadFlight(old);
  assert.equal(migrated.rcsEnabled, false);
  active.dispose();
  g.dispose();
  migrated.dispose();
});

test('Tug RCS removes cancelling nozzles without losing axial thrust or torque balance', () => {
  const craft = preset('tug-launcher').slice(0, 11),
    ts = rcsThrusters(craft, PARTS),
    com = statistics(craft).com;
  for (const translation of [
    new T.Vector3(1, 0, 0),
    new T.Vector3(0, 1, 0),
    new T.Vector3(0, 0, 1),
    new T.Vector3(0.3, -0.2, 0.5)
  ]) {
    const levels = mixRCS(ts, com, new T.Vector3(), translation);
    for (let i = 0; i < ts.length; i++)
      for (let j = i + 1; j < ts.length; j++)
        if (ts[i].id === ts[j].id && ts[i].direction.dot(ts[j].direction) < -0.999)
          assert.ok(Math.min(levels[i], levels[j]) < 1e-12);
    const force = new T.Vector3(),
      torque = new T.Vector3();
    let spent = 0;
    ts.forEach((t, i) => {
      const f = t.direction.clone().multiplyScalar(t.thrust * levels[i]);
      force.add(f);
      torque.add(t.position.clone().sub(com).cross(f));
      spent += f.length();
    });
    if (translation.y === 1) {
      assert.ok(Math.abs(force.y - 480) < 1e-6);
      assert.ok(torque.length() < 1e-6);
      assert.ok(Math.abs(spent - 480) < 1e-6);
    }
    // This off-center command is constrained: preserve its pre-cleanup wrench.
    if (translation.z === 1) {
      assert.ok(Math.abs(force.z - 463.83289807191943) < 1e-6);
      assert.ok(Math.abs(torque.x - 30.289461935971275) < 1e-6);
    }
  }
});
