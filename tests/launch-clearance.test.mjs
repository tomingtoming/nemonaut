import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {launchObstructions} from '../dist/launch-clearance.js';
import {launchWorld, retireWorldVessel} from '../dist/world-operations.js';
import {worldFromFlight} from '../dist/world-save.js';
test('Ground launch rejects occupied site atomically and identifies the vessel to clear', () => {
  const design = {parts: preset('rocket'), name: 'Parked rocket', environment: 'land'},
    world = launchWorld(worldFromFlight(null, {universalTime: 13000}), design),
    before = structuredClone(world);
  assert.throws(
    () => launchWorld(world, {...design, name: 'New rocket'}),
    e => e.code === 'launch_site_occupied' && e.blockers[0].id === world.activeVesselId
  );
  assert.deepEqual(world, before);
  const cleared = retireWorldVessel(world, world.activeVesselId, 'terminate').world;
  assert.equal(launchWorld(cleared, design).vessels.length, 1);
});
test('Physical overlap is checked across facility labels, including debris and large rotated parts', () => {
  const a = new Flight(preset('rocket'), 'land'),
    b = new Flight(preset('plane'), 'runway');
  try {
    b.pos.copy(a.pos);
    b.q.copy(a.q);
    b.vesselName = 'Runway craft';
    assert.equal(launchObstructions(a, [b])[0].name, 'Runway craft');
    b.crashed = true;
    assert.equal(launchObstructions(a, [b]).length, 1);
    b.pos.x += 500;
    assert.equal(launchObstructions(a, [b]).length, 0);
    b.parts[0].p[0] -= 500;
    assert.equal(launchObstructions(a, [b]).length, 1, 'geometry, not just root position');
    b.q.setFromAxisAngle(new T.Vector3(0, 0, 1), Math.PI / 2);
    assert.equal(launchObstructions(a, [b]).length, 0);
  } finally {
    a.dispose();
    b.dispose();
  }
});
test('Orbiting vessels and cleared ground positions do not block launches; practice placement remains independent', () => {
  const a = new Flight(preset('rocket'), 'land'),
    b = new Flight(preset('rocket'), 'orbit');
  try {
    assert.deepEqual(launchObstructions(a, [b]), []);
    assert.deepEqual(launchObstructions(b, [b]), []);
    b.pos.copy(a.pos).add(new T.Vector3(30, 0, 0));
    assert.deepEqual(launchObstructions(a, [b]), []);
  } finally {
    a.dispose();
    b.dispose();
  }
});
