import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Flight, descendants} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {fleet} from '../dist/fleet.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import {stagePlan} from '../dist/staging.js';
test('Individual separation preserves stage, ignition and resources with rotating mass conservation', () => {
  const f = new Flight(preset('launcher'), 'orbit');
  let restored;
  try {
    f.stageNext();
    f.throttle = 0.42;
    f.omega.set(0.02, 0.03, 0.04);
    const ring = f.parts.find(p => p.type === 'decoupler'),
      expected = descendants(f.parts, ring.id),
      active = [...f.active].sort(),
      fuel = [...f.fuel].sort(),
      charge = [...f.charge].sort();
    const momentum = f.vel.clone().multiplyScalar(f.stats.mass),
      mass = f.stats.mass,
      center = f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));
    assert.deepEqual(f.decouplePart(ring.id), expected);
    assert.equal(f.stage, 0);
    assert.equal(f.started, true);
    assert.equal(f.brake, false);
    assert.equal(f.throttle, 0.42);
    const all = fleet(f);
    assert.equal(all.length, 2);
    assert.deepEqual(all.flatMap(v => [...v.active]).sort(), active);
    assert.deepEqual(all.flatMap(v => [...v.fuel]).sort(), fuel);
    assert.deepEqual(all.flatMap(v => [...v.charge]).sort(), charge);
    assert.ok(
      all.reduce((sum, v) => sum.addScaledVector(v.vel, v.stats.mass), new T.Vector3()).distanceTo(momentum) <
        1e-7
    );
    assert.ok(
      all
        .reduce(
          (sum, v) =>
            sum.addScaledVector(
              v.pos.clone().add(v.stats.com.clone().applyQuaternion(v.q)),
              v.stats.mass / mass
            ),
          new T.Vector3()
        )
        .distanceTo(center) < 1e-8
    );
    assert.equal(f.decouplePart(ring.id).size, 0);
    assert.equal(f.detached[0].canDecouplePart(ring.id), false);
    restored = loadFlight(saveFlight(f));
    assert.equal(restored.stage, 0);
    assert.equal(restored.detached.length, 1);
    assert.deepEqual([...restored.detached[0].active].sort(), active);
    f.stageNext();
    assert.equal(f.stage, 1);
    assert.equal(f.detached.length, 1);
    assert.equal(f.active.size, 1);
  } finally {
    f.dispose();
    restored?.dispose();
  }
});
test('Individual separation does not start flight or arm chutes and rejects unavailable hardware', () => {
  const f = new Flight(preset('returner'), 'orbit');
  try {
    const ring = f.parts.find(p => p.type === 'decoupler');
    assert.ok(ring);
    assert.equal(f.decouplePart('missing').size, 0);
    assert.equal(f.decouplePart(f.parts[0].id).size, 0);
    f.crashed = true;
    assert.equal(f.canDecouplePart(ring.id), false);
    assert.equal(f.decouplePart(ring.id).size, 0);
    f.crashed = false;
    f.thermal.get(ring.id).failed = true;
    assert.equal(f.decouplePart(ring.id).size, 0);
    f.thermal.get(ring.id).failed = false;
    assert.ok(f.decouplePart(ring.id).size);
    assert.equal(f.stage, -1);
    assert.equal(f.started, false);
    assert.equal(f.brake, true);
    assert.equal(f.active.size, 0);
    assert.ok(fleet(f).every(v => [...v.chutes.values()].every(c => c.status === 'stowed')));
  } finally {
    f.dispose();
  }
});
test('Large lunar stack supports lower-first and upper-first individual separation with stable stage slots', () => {
  for (const order of [[1, 2, 3], [3]]) {
    const f = new Flight(preset('lunar-surface-expedition'), 'orbit');
    let restored;
    try {
      const initialIds = f.parts.map(p => p.id).sort(),
        initialFuel = [...f.fuel].sort();
      f.stageNext();
      for (const stage of order) {
        const ring = f.parts.find(p => p.type === 'decoupler' && p.stage === stage),
          branch = descendants(f.parts, ring.id);
        assert.deepEqual(f.decouplePart(ring.id), branch);
        assert.equal(f.stage, 0);
        const plan = stagePlan(f.parts);
        assert.equal(plan.length, 5);
        assert.equal(plan[4].actions[0].kind, 'chute');
        assert.ok(plan.flatMap(s => s.actions).every(a => !branch.has(a.id)));
        assert.deepEqual(
          fleet(f)
            .flatMap(v => v.parts.map(p => p.id))
            .sort(),
          initialIds
        );
        assert.deepEqual(
          fleet(f)
            .flatMap(v => [...v.fuel])
            .sort(),
          initialFuel
        );
        restored = loadFlight(saveFlight(f));
        assert.equal(fleet(restored).length, 1 + order.indexOf(stage) + 1);
        restored.dispose();
        restored = null;
      }
      assert.equal(f.parts.length, 3);
      assert.equal(f.chutes.values().next().value.status, 'stowed');
      for (let i = 1; i <= 4; i++) f.stageNext();
      assert.equal(f.chutes.values().next().value.status, 'armed');
    } finally {
      restored?.dispose();
      f.dispose();
    }
  }
});
test('Symmetric sibling rings separate individually, leaving the other branch for staging', () => {
  const parts = preset('twin'),
    ring = parts.find(p => p.type === 'decoupler'),
    ids = descendants(parts, ring.id),
    branch = parts.filter(p => ids.has(p.id));
  const remap = new Map(branch.map(p => [p.id, crypto.randomUUID()]));
  ring.symmetryGroup = 'paired-rings';
  const sibling = branch.map(p => ({
    ...structuredClone(p),
    id: remap.get(p.id),
    parent: remap.get(p.parent) || p.parent,
    p: [p.p[0] + 5, p.p[1], p.p[2]]
  }));
  const f = new Flight([...parts, ...sibling], 'orbit');
  let restored;
  try {
    f.stageNext();
    assert.deepEqual(f.decouplePart(ring.id), ids);
    assert.equal(f.canDecouplePart(remap.get(ring.id)), true);
    assert.equal(f.stage, 0);
    assert.equal(stagePlan(f.parts)[1].actions.filter(a => a.kind === 'separate').length, 1);
    restored = loadFlight(saveFlight(f));
    assert.equal(restored.canDecouplePart(remap.get(ring.id)), true);
    assert.deepEqual(f.stageNext(), new Set(sibling.map(p => p.id)));
    assert.equal(f.detached.length, 2);
    assert.equal(new Set(fleet(f).flatMap(v => v.parts.map(p => p.id))).size, parts.length + sibling.length);
  } finally {
    restored?.dispose();
    f.dispose();
  }
});
