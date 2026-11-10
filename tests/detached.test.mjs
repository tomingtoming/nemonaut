import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight, statistics} from '../dist/core.js';
import {preset, PARTS} from '../dist/catalog.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
const totalFuel = f => [...f.fuel.values()].reduce((s, v) => s + v, 0);
test('Separation preserves all parts, fuel, world pose, angular velocity and total linear momentum', () => {
  const f = new Flight(preset('launcher'), 'orbit');
  f.stageNext();
  f.omega.set(0.1, 0.2, 0.3);
  f.fuel.set([...f.fuel.keys()][0], 123);
  const before = statistics(f.parts, f.fuel),
    momentum = f.vel.clone().multiplyScalar(before.mass),
    q = f.q.clone(),
    pos = f.pos.clone(),
    fuel = totalFuel(f),
    count = f.parts.length;
  f.stageNext();
  assert.equal(f.detached.length, 1);
  const child = f.detached[0];
  assert.equal(f.parts.length + child.parts.length, count);
  assert.equal(totalFuel(f) + totalFuel(child), fuel);
  assert.equal(child.q.angleTo(q), 0);
  assert.ok(child.pos.distanceTo(pos) < 1e-8);
  assert.deepEqual(child.omega, f.omega);
  assert.ok(
    f.vel
      .clone()
      .multiplyScalar(f.stats.mass)
      .addScaledVector(child.vel, child.stats.mass)
      .distanceTo(momentum) < 1e-7
  );
  assert.equal(child.parts.filter(p => !p.parent).length, 1);
  assert.ok(child.parts.every(p => !f.parts.some(a => a.id === p.id)));
  f.dispose();
});
test('Separated engines retain their own propellant and thrust while a crashed parent does not stop their simulation', () => {
  const f = new Flight(preset('launcher'), 'orbit');
  f.stageNext();
  f.stageNext();
  const child = f.detached[0],
    before = totalFuel(child),
    parentFuel = totalFuel(f);
  child.throttle = 0.1;
  f.throttle = 0;
  f.crashed = true;
  const pos = child.pos.clone();
  for (let i = 0; i < 120; i++) f.step(1 / 120);
  assert.ok(child.pos.distanceTo(pos) > 1000);
  assert.ok(totalFuel(child) < before);
  assert.equal(totalFuel(f), parentFuel);
  assert.ok(child.lastThrust > 0);
  f.dispose();
});
test('Multiple separations remain independent and roundtrip their physics and resources', () => {
  const f = new Flight(preset('returner'), 'orbit');
  f.stageNext();
  f.stageNext();
  f.stageNext();
  assert.equal(f.detached.length, 2);
  for (let i = 0; i < 120; i++) f.step(1 / 120);
  const g = loadFlight(JSON.parse(JSON.stringify(saveFlight(f))));
  assert.equal(g.detached.length, 2);
  for (let i = 0; i < 120; i++) {
    f.step(1 / 120);
    g.step(1 / 120);
  }
  for (let i = 0; i < 2; i++) {
    assert.ok(f.detached[i].pos.distanceTo(g.detached[i].pos) < 0.02);
    assert.deepEqual([...f.detached[i].fuel], [...g.detached[i].fuel]);
  }
  f.dispose();
  g.dispose();
});
test('Corrupt or duplicate detached states are rejected without changing the active flight', () => {
  const f = new Flight(preset('launcher'), 'orbit');
  f.stageNext();
  f.stageNext();
  const saved = saveFlight(f);
  for (const mutate of [
    s => (s.detached[0].pos = [Infinity, 0, 0]),
    s => s.detached.push(structuredClone(s.detached[0])),
    s => (s.detached = 'bad')
  ]) {
    const s = structuredClone(saved);
    mutate(s);
    assert.throws(() => loadFlight(s));
  }
  assert.equal(f.detached.length, 1);
  f.step(1 / 120);
  assert.equal(f.crashed, false);
  f.dispose();
});

test('Nested separators fired together produce separate connected branches, without duplicate parts', () => {
  const parts = preset('returner');
  for (const p of parts) if (PARTS[p.type].decoupler) p.stage = 1;
  const f = new Flight(parts, 'orbit');
  f.stageNext();
  f.stageNext();
  assert.equal(f.detached.length, 2);
  const all = [...f.parts, ...f.detached.flatMap(c => c.parts)];
  assert.equal(all.length, parts.length);
  assert.equal(new Set(all.map(p => p.id)).size, parts.length);
  for (const c of f.detached) assert.equal(c.parts.filter(p => !p.parent).length, 1);
  const g = loadFlight(saveFlight(f));
  assert.equal(g.detached.length, 2);
  g.dispose();
  f.dispose();
});
