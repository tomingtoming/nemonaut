import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight, validateCraft} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {fleet, selectVessel, canControl} from '../dist/fleet.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
const split = () => {
  const f = new Flight(preset('twin'), 'orbit');
  f.stageNext();
  f.stageNext();
  return f;
};
test('Twin probe blueprint separates into two controllable vessels', () => {
  const parts = preset('twin');
  validateCraft({version: 1, parts});
  const f = split();
  assert.equal(fleet(f).length, 2);
  assert.ok(fleet(f).every(canControl));
  assert.equal(f.parts.length + f.detached[0].parts.length, parts.length);
  f.dispose();
});
test('Switching back and forth preserves exact state, all resources and one simulation of each vessel', () => {
  const first = split(),
    second = first.detached[0],
    firstPos = first.pos.clone(),
    secondPos = second.pos.clone(),
    fuel = JSON.stringify(fleet(first).map(f => [...f.fuel]));
  let active = selectVessel(first, second);
  assert.equal(active, second);
  assert.ok(first.pos.equals(firstPos));
  assert.ok(second.pos.equals(secondPos));
  assert.equal(active.detached[0], first);
  const times = fleet(active).map(f => f.time);
  active.step(0.1);
  fleet(active).forEach((f, i) => assert.ok(Math.abs(f.time - times[i] - 0.1) < 1e-8));
  active = selectVessel(active, first);
  assert.equal(fuel, JSON.stringify(fleet(active).map(f => [...f.fuel])));
  assert.equal(fleet(active).length, 2);
  active.dispose();
});
test('Selected engine burns only its tanks while the previous vessel keeps coasting', () => {
  const first = split(),
    second = first.detached[0],
    before = first.fuelRatio,
    active = selectVessel(first, second);
  active.stageNext();
  active.throttle = 0.2;
  for (let i = 0; i < 120; i++) active.step(1 / 120);
  assert.ok(active.fuelRatio < 1);
  assert.equal(first.fuelRatio, before);
  assert.ok(Math.abs(first.time - 1) < 1e-8);
  active.dispose();
});
test('Save/restore retains the selected vessel as the root and can switch back afterward', () => {
  const first = split(),
    active = selectVessel(first, first.detached[0]);
  active.stageNext();
  active.throttle = 0.1;
  active.step(0.1);
  const originalIds = active.parts.map(p => p.id),
    g = loadFlight(JSON.parse(JSON.stringify(saveFlight(active))));
  assert.deepEqual(
    g.parts.map(p => p.id),
    originalIds
  );
  assert.equal(g.throttle, 0.1);
  assert.equal(fleet(g).length, 2);
  const restoredFirst = g.detached[0],
    h = selectVessel(g, restoredFirst);
  assert.deepEqual(
    h.parts.map(p => p.id),
    first.parts.map(p => p.id)
  );
  active.dispose();
  h.dispose();
});
test('Uncontrolled, damaged and foreign vessels cannot be selected and rejection preserves the fleet', () => {
  const f = new Flight(preset('launcher'), 'orbit');
  f.stageNext();
  f.stageNext();
  const child = f.detached[0];
  assert.equal(canControl(child), false);
  assert.throws(() => selectVessel(f, child));
  const foreign = new Flight(preset('rocket'), 'orbit');
  assert.throws(() => selectVessel(f, foreign));
  assert.equal(f.detached[0], child);
  foreign.dispose();
  f.dispose();
  const twin = split();
  twin.detached[0].crashed = true;
  assert.throws(() => selectVessel(twin, twin.detached[0]));
  assert.equal(fleet(twin).length, 2);
  twin.dispose();
});

test('A detached root separator does not erase the selected vessel from performance estimates', async () => {
  const {stagePerformance} = await import('../dist/resources.js');
  const f = split(),
    second = f.detached[0],
    plan = stagePerformance(second.parts, second.fuel);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].thrust, 45000);
  assert.ok(plan[0].dv > 3000);
  f.dispose();
});
