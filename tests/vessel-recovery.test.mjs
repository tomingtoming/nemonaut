import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import {recoveryStatus, retireVessel} from '../dist/vessel-recovery.js';
import {launchIntoFleet} from '../dist/launch-fleet.js';
import {trackingList, trackedFlight} from '../dist/tracking.js';
import {setTarget} from '../dist/relative-navigation.js';
const design = {parts: preset('rocket'), name: 'Explorer', environment: 'orbit'};
test('Recovery requires stationary undamaged ground contact or water contact', () => {
  const f = new Flight(preset('rocket'), 'land');
  for (let i = 0; i < 360; i++) f.step(1 / 120);
  assert.equal(recoveryStatus(f).recoverable, true);
  f.vel.x = 2;
  assert.equal(recoveryStatus(f).recoverable, false);
  f.vel.x = 0;
  f.throttle = 0.1;
  assert.equal(recoveryStatus(f).recoverable, false);
  f.throttle = 0;
  f.crashed = true;
  assert.equal(recoveryStatus(f).recoverable, false);
  f.dispose();
  const water = new Flight(preset('recovery'), 'water');
  water.time = 1;
  assert.equal(recoveryStatus(water).recoverable, true);
  water.pos.y = 100;
  assert.equal(recoveryStatus(water).recoverable, false);
  water.dispose();
});
test('Retirement rejects invalid requests atomically and clears only affected navigation', () => {
  const a = launchIntoFleet(null, design),
    b = launchIntoFleet(saveFlight(a), design);
  a.dispose();
  const old = b.detached[0];
  setTarget(b, b, old);
  b.sasMode = 'target';
  old.fuel.set(old.parts.find(p => p.type === 'tank').id, 1200);
  const before = saveFlight(b),
    copy = structuredClone(before),
    id = old.parts[0].id;
  assert.throws(() => retireVessel(before, id, 'recover'));
  assert.throws(() => retireVessel(before, 'unknown', 'terminate'));
  assert.throws(() => retireVessel(before, id, 'oops'));
  assert.deepEqual(before, copy);
  const result = retireVessel(before, id, 'terminate'),
    after = loadFlight(result.record);
  assert.equal(after.detached.length, 0);
  assert.equal(after.targetPartId, null);
  assert.equal(after.sasMode, 'hold');
  assert.deepEqual(after.pos, b.pos);
  assert.deepEqual([...after.fuel], [...b.fuel]);
  assert.deepEqual(before, copy);
  after.dispose();
  b.dispose();
});
test('Terminating the controlled root preserves debris-only saves and permits new launches', () => {
  const f = new Flight(preset('launcher'), 'orbit');
  f.stageNext();
  f.stageNext();
  const record = saveFlight(f),
    id = f.parts[0].id;
  const result = retireVessel(record, id, 'terminate'),
    rows = trackingList(result.record);
  assert.ok(rows.length > 0);
  assert.ok(rows.every(r => !r.controllable));
  assert.throws(() => trackedFlight(result.record, rows[0].id));
  const observed = trackedFlight(result.record, rows[0].id, true),
    g = loadFlight(observed.record),
    h = loadFlight(observed.record);
  for (let i = 0; i < 60; i++) {
    g.step(1 / 120, {pitch: 1, yaw: 1, drive: 1, translateX: 1});
    h.step(1 / 120);
  }
  assert.ok(g.pos.distanceTo(h.pos) < 1e-9);
  assert.ok(g.q.angleTo(h.q) < 1e-7);
  const fresh = launchIntoFleet(result.record, design);
  assert.equal(fresh.detached.length, rows.length);
  assert.deepEqual(result.record.parts, record.detached[0].parts);
  fresh.dispose();
  g.dispose();
  h.dispose();
  f.dispose();
});
test('Last vessel retirement leaves an empty world and an exact undo snapshot', () => {
  const f = new Flight(preset('rocket'), 'land');
  for (let i = 0; i < 360; i++) f.step(1 / 120);
  const before = saveFlight(f),
    undo = structuredClone(before),
    result = retireVessel(before, f.parts[0].id, 'recover');
  assert.equal(result.record, null);
  assert.deepEqual(before, undo);
  const restored = loadFlight(undo),
    roundtrip = saveFlight(restored);
  assert.ok(roundtrip.q.every((v, i) => Math.abs(v - before.q[i]) < 1e-10));
  roundtrip.q = before.q;
  assert.deepEqual(roundtrip, before);
  assert.equal(trackingList(null).length, 0);
  restored.dispose();
  f.dispose();
});
test('Removing a vessel frees the shared part budget without altering the remaining craft', () => {
  const parts = preset('rocket');
  for (let i = parts.length; i < 395; i++)
    parts.push({...structuredClone(parts[0]), id: 'extra-' + i, parent: parts[0].id});
  const large = launchIntoFleet(null, {...design, parts}),
    saved = saveFlight(large);
  assert.throws(() => launchIntoFleet(saved, design));
  const cleared = retireVessel(saved, large.parts[0].id, 'terminate'),
    fresh = launchIntoFleet(cleared.record, design);
  assert.equal(fresh.parts.length, 7);
  assert.equal(fresh.detached.length, 0);
  large.dispose();
  fresh.dispose();
});
