import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {PARTS, preset} from '../dist/catalog.js';
import {Flight, statistics, validateCraft} from '../dist/core.js';
import {nodeConnection} from '../dist/attachment-nodes.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import {examples, exampleGroups} from '../dist/examples.js';
function empty(parts) {
  const ring = parts.find(p => p.type === 'decoupler');
  const removed = new Set([ring.id]);
  for (const p of parts) if (removed.has(p.parent)) removed.add(p.id);
  return parts.filter(p => !removed.has(p.id));
}
test('cargo transport keeps belly hatch, aligned internal payload and two fuel tanks', () => {
  const craft = preset('transport-cargo'),
    bay = craft.find(p => p.type === 'cargoBay'),
    ring = craft.find(p => p.type === 'decoupler');
  assert.deepEqual(validateCraft({version: 1, parts: craft}), craft);
  assert.equal(craft.length, 72);
  const direction = new T.Vector3(0, 0, 1).applyEuler(new T.Euler(...bay.r));
  assert.ok(direction.y < -0.999999);
  assert.equal(nodeConnection(craft, ring).parentNode, 6);
  assert.equal(statistics(craft).fuel, 90000);
  assert.equal(statistics(preset('transport')).fuel, 135000);
  assert.equal(craft.filter(p => PARTS[p.type].air).length, 6);
  assert.equal(craft.filter(p => PARTS[p.type].wheel).length, 32);
  assert.equal(examples['transport-cargo'][3], 'runway');
  assert.ok(exampleGroups.find(g => g.id === 'vehicle').keys.includes('transport-cargo'));
});
for (const [label, unloaded, open] of [
  ['loaded closed', false, false],
  ['loaded open', false, true],
  ['empty closed', true, false]
])
  test(`cargo transport ${label} takes off and restores airborne cargo state`, () => {
    let craft = preset('transport-cargo');
    if (unloaded) craft = empty(craft);
    const bay = craft.find(p => p.type === 'cargoBay');
    bay.cargoOpen = open;
    let f = new Flight(craft, 'runway', 161149.5);
    f.stageNext();
    f.throttle = 1;
    try {
      for (let i = 0; i < 120 * 120; i++) {
        const t = i / 120;
        f.step(1 / 120, {pitch: t > 15 && t < 45 ? -1 : 0});
        assert.equal(f.crashed, false);
      }
      assert.ok(f.orbit.altitude > 400);
      assert.ok(f.orbit.vertical > 5);
      assert.equal(f.telemetry.contacts, 0);
      assert.equal(f.parts.length, unloaded ? 67 : 72);
      assert.ok(f.parts.filter(p => PARTS[p.type].air).every(p => f.engineThrust.get(p.id) > 0));
      const pos = f.pos.clone(),
        fuel = f.fuelRatio,
        com = f.stats.com.clone();
      const restored = loadFlight(saveFlight(f));
      f.dispose();
      f = restored;
      assert.ok(f.pos.distanceTo(pos) < 1e-5);
      assert.ok(Math.abs(f.fuelRatio - fuel) < 1e-8);
      assert.ok(f.stats.com.distanceTo(com) < 1e-5);
      assert.equal(f.parts.find(p => p.type === 'cargoBay').cargoOpen, open);
      assert.equal(f.parts.length, unloaded ? 67 : 72);
      for (let i = 0; i < 120; i++) f.step(1 / 120);
      assert.equal(f.crashed, false);
    } finally {
      f.dispose();
    }
  });
