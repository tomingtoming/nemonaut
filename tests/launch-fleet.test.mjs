import test from 'node:test';
import assert from 'node:assert/strict';
import {freshLaunchParts, launchIntoFleet} from '../dist/launch-fleet.js';
import {preset} from '../dist/catalog.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import {fleet} from '../dist/fleet.js';
import {trackedFlight, trackingList} from '../dist/tracking.js';
test('Repeated launches get fresh IDs including reciprocal docking and parent references', () => {
  const design = preset('docking'),
    original = structuredClone(design),
    a = freshLaunchParts(design),
    b = freshLaunchParts(design, new Set(a.map(p => p.id)));
  assert.deepEqual(design, original);
  const ids = new Set(a.map(p => p.id));
  for (const p of a) {
    assert.ok(!p.parent || ids.has(p.parent));
    if (p.dockPartner) assert.equal(a.find(q => q.id === p.dockPartner).dockPartner, p.id);
  }
  assert.equal(
    b.some(p => ids.has(p.id)),
    false
  );
  assert.throws(() => freshLaunchParts(design, new Set(), () => 'collision'));
});
test('Launching a second craft preserves the first, advances both, and survives selection and roundtrip', () => {
  const design = {parts: preset('rocket'), name: 'Explorer', environment: 'orbit'},
    a = launchIntoFleet(null, design);
  a.stageNext();
  a.throttle = 0.3;
  for (let i = 0; i < 120; i++) a.step(1 / 120);
  a.throttle = 0;
  const saved = saveFlight(a),
    b = launchIntoFleet(saved, {...design, environment: 'land'});
  assert.equal(b.vesselName, 'Explorer / 2');
  assert.equal(b.detached.length, 1);
  const old = b.detached[0];
  assert.deepEqual(old.pos.toArray(), a.pos.toArray());
  assert.deepEqual([...old.fuel], [...a.fuel]);
  assert.equal(old.time, a.time);
  assert.equal(b.time, 0);
  assert.equal(new Set(fleet(b).flatMap(v => v.parts.map(p => p.id))).size, 14);
  b.step(1 / 120);
  assert.ok(old.time > a.time);
  const rows = trackingList(saveFlight(b)),
    selected = trackedFlight(saveFlight(b), rows[1].id),
    c = loadFlight(selected.record);
  assert.equal(c.vesselName, 'Explorer');
  assert.equal(c.detached[0].vesselName, 'Explorer / 2');
  assert.deepEqual([...c.fuel], [...old.fuel]);
  assert.deepEqual(saved, saveFlight(a));
  a.dispose();
  b.dispose();
  c.dispose();
});
test('Launch failures preserve the serialized world and repeated launches stay flat', () => {
  const design = {parts: preset('rocket'), name: 'Fleet', environment: 'orbit'};
  let f = launchIntoFleet(null, design);
  for (let i = 0; i < 5; i++) {
    const next = launchIntoFleet(saveFlight(f), design);
    f.dispose();
    f = next;
  }
  assert.equal(f.detached.length, 5);
  assert.ok(f.detached.every(v => v.detached.length === 0));
  const before = saveFlight(f),
    copy = structuredClone(before);
  assert.throws(() => launchIntoFleet(before, {...design, environment: 'bad'}));
  const huge = preset('rocket');
  const root = huge[0];
  for (let i = huge.length; i < 400; i++)
    huge.push({...structuredClone(root), id: 'extra-' + i, parent: root.id});
  assert.throws(() => launchIntoFleet(before, {...design, parts: huge}));
  assert.deepEqual(before, copy);
  f.dispose();
});
