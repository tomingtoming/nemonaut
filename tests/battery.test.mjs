import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {part, PARTS} from '../dist/catalog.js';
import {Flight} from '../dist/core.js';
import {canControl} from '../dist/fleet.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import {powerTotals, powerStep, SUN_DIRECTION} from '../dist/power.js';
import {center, PLANET} from '../dist/planet.js';
test('Dedicated storage powers the craft without adding control or wheel torque', () => {
  const probe = part('probe'),
    battery = part('battery', [0, 0.35, 0], [0, 0, 0], probe.id),
    f = new Flight([probe, battery], 'land');
  try {
    assert.equal(powerTotals(f.parts, f.charge).capacity, 1200);
    assert.equal(canControl({parts: [battery], crashed: false}), false);
    assert.equal(PARTS.battery.reactionTorque, undefined);
    f.charge.set(probe.id, 0);
    f.charge.set(battery.id, 12);
    const night = center.clone().addScaledVector(SUN_DIRECTION, -PLANET.radius - 100),
      result = powerStep(f.parts, f.charge, night, new T.Quaternion(), {pitch: 1, yaw: 0, roll: 0}, true, 5);
    assert.equal(result.ratio, 1);
    assert.ok(Math.abs(f.charge.get(battery.id) - 6) < 1e-9);
    assert.equal(f.charge.get(probe.id), 0);
    f.separateRoots([battery]);
    const child = f.detached[0];
    assert.equal(powerTotals(f.parts, f.charge).stored, 0);
    assert.ok(Math.abs(child.charge.get(battery.id) - 6) < 1e-9);
    const restored = loadFlight(JSON.parse(JSON.stringify(saveFlight(f))));
    try {
      assert.equal(restored.charge.size, 1);
      assert.ok(Math.abs(restored.detached[0].charge.get(battery.id) - 6) < 1e-9);
    } finally {
      restored.dispose();
    }
  } finally {
    f.dispose();
  }
});
test('Solar charges the dedicated battery and respects combined capacity', () => {
  const probe = part('probe'),
    battery = part('battery', [0, 0.35, 0], [0, 0, 0], probe.id),
    solar = part('solar', [0, 1, 0], [0, 0, 0], probe.id),
    f = new Flight([probe, battery, solar], 'land');
  try {
    for (const id of f.charge.keys()) f.charge.set(id, 0);
    const day = center.clone().addScaledVector(SUN_DIRECTION, PLANET.radius + 100),
      q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), SUN_DIRECTION),
      idle = {pitch: 0, yaw: 0, roll: 0};
    powerStep(f.parts, f.charge, day, q, idle, false, 750);
    assert.ok(Math.abs(f.charge.get(battery.id) - 500) < 1e-9);
    assert.ok(Math.abs(powerTotals(f.parts, f.charge).stored - 600) < 1e-9);
    powerStep(f.parts, f.charge, day, q, idle, false, 2000);
    assert.equal(f.charge.get(battery.id), 1000);
    assert.equal(powerTotals(f.parts, f.charge).stored, 1200);
  } finally {
    f.dispose();
  }
});
