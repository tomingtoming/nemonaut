import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {part} from '../dist/catalog.js';
import {loadFlight, saveFlight} from '../dist/flight-save.js';
import {launchWorld} from '../dist/world-operations.js';
import {worldFromFlight, flightFromWorld, validateWorld} from '../dist/world-save.js';
import {surfaceVelocity, surfaceOrientation} from '../dist/surface-frame.js';
import {PRIMARY} from '../dist/celestial.js';
import {
  DELIVERY_SITE,
  deliverySitePosition,
  deliveryDistance,
  deliveryBearing
} from '../dist/delivery-sites.js';
import {deliveryTelemetry, recordDeliveryAchievements} from '../dist/surface-delivery.js';

function fixture() {
  const probe = part('probe'),
    solar = part('solar', [0, 0.3, 0], [Math.PI / 2, 0, 0], probe.id);
  const world = launchWorld(worldFromFlight(null), {
    parts: [probe, solar],
    name: 'Station',
    environment: 'land'
  });
  const f = loadFlight(flightFromWorld(world));
  f.time = 10;
  f.universalTime = 10;
  f.q
    .copy(surfaceOrientation(10))
    .multiply(
      new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), -DELIVERY_SITE.north / PRIMARY.radius)
    );
  const up = new T.Vector3(0, 1, 0).applyQuaternion(f.q);
  f.pos.copy(deliverySitePosition(10)).addScaledVector(up, 0.2);
  f.vel.copy(surfaceVelocity(f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)), 10));
  f.landed = true;
  return {world, f};
}
test('Destination co-rotates with the surface and arc distance is independent of altitude', () => {
  for (const time of [0, 10000, 21549.4251830898, 1e7]) {
    const p = deliverySitePosition(time);
    assert.ok(deliveryDistance(p, time) < 0.02);
    const center = new T.Vector3(0, -PRIMARY.radius, 0),
      high = p.clone().sub(center).multiplyScalar(2).add(center);
    assert.ok(deliveryDistance(high, time) < 0.02);
    const pad = new T.Vector3(0, PRIMARY.radius, 0).applyQuaternion(surfaceOrientation(time)).add(center);
    assert.ok(Math.abs(deliveryDistance(pad, time) - 600) < 0.001);
    const bearing = deliveryBearing(pad, time);
    assert.ok(Math.min(bearing, 360 - bearing) < 0.001);
    assert.equal(deliveryBearing(p, time), null);
  }
});
test('Delivery records physical station parts once and persists across world/flight serialization', () => {
  const {world, f} = fixture();
  try {
    assert.equal(deliveryTelemetry(f, world.history).ready, true);
    const history = recordDeliveryAchievements(world.history, f);
    assert.equal(history.length, 2);
    assert.equal(history[1].siteId, DELIVERY_SITE.id);
    assert.equal(recordDeliveryAchievements(history, f), history);
    const saved = worldFromFlight(saveFlight(f), {history}),
      restored = validateWorld(JSON.parse(JSON.stringify(saved)));
    assert.deepEqual(restored.history, history);
    assert.equal(restored.vessels[0].parts.length, 2);
    for (const change of [
      e => (e.distance = 31),
      e => (e.speed = 0.5),
      e => (e.siteId = 'unknown'),
      e => (e.probePartId = 'unknown'),
      e => (e.launchEventIds = []),
      e => (e.distance = NaN)
    ]) {
      const bad = structuredClone(saved);
      change(bad.history[1]);
      assert.throws(() => validateWorld(bad));
    }
    const duplicate = structuredClone(saved);
    duplicate.history.push({...duplicate.history[1], id: 'duplicate'});
    assert.throws(() => validateWorld(duplicate));
  } finally {
    f.dispose();
  }
});
test('Practice, missing origin, transport, flyby, damage and unpowered stations earn nothing', () => {
  const cases = [
    ({world, f}) => (world.history = []),
    ({world}) => (world.history[0].environment = 'orbit'),
    ({f}) => (f.parts = f.parts.filter(p => p.type !== 'solar')),
    ({f}) => (f.crashed = true),
    ({f}) => (f.landed = false),
    ({f}) => (f.vel.x += 1),
    ({f}) => (f.pos.x += 100),
    ({f}) => f.pos.addScaledVector(new T.Vector3(0, 1, 0).applyQuaternion(f.q), 10),
    ({f}) => f.charge.set(f.parts.find(p => p.type === 'probe').id, 0),
    ({f}) => (f.thermal.values().next().value.failed = true),
    ({f, world}) => {
      const wheel = part('wheel');
      f.parts.push(wheel);
      world.history[0].partIds.push(wheel.id);
      world.history[0].parts++;
    }
  ];
  for (const change of cases) {
    const state = fixture();
    try {
      change(state);
      assert.equal(recordDeliveryAchievements(state.world.history, state.f), state.world.history);
    } finally {
      state.f.dispose();
    }
  }
  const {world, f} = fixture();
  try {
    assert.equal(recordDeliveryAchievements(world.history, f, {practice: true}), world.history);
  } finally {
    f.dispose();
  }
});
