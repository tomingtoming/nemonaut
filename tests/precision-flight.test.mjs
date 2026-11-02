import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {preset} from '../dist/catalog.js';
import {launchWorld} from '../dist/world-operations.js';
import {worldFromFlight, flightFromWorld, validateWorld} from '../dist/world-save.js';
import {loadFlight, saveFlight} from '../dist/flight-save.js';
import {
  deliverySitePosition,
  deliveryDistance,
  DELIVERY_SITE,
  DELIVERY_SITES
} from '../dist/delivery-sites.js';
import {recordFlightChallenges} from '../dist/precision-landing.js';
import {surfaceRelativeVelocity, PRIMARY_ROTATION_PERIOD} from '../dist/surface-frame.js';
import {descentTelemetry} from '../dist/descent.js';
import {center} from '../dist/planet.js';
// Test-only guidance supplies SAS attitude targets and throttle, never position or velocity.
for (const [site, epoch] of [
  [DELIVERY_SITE, 0],
  [DELIVERY_SITE, PRIMARY_ROTATION_PERIOD / 4],
  [DELIVERY_SITES[1], 0]
])
  test('Hopper flies from launch pad to ' + site.id + ' at UT ' + epoch, () => {
    const world = launchWorld(worldFromFlight(null, {universalTime: epoch}), {
        parts: preset('hopper'),
        name: 'Hopper',
        environment: 'land'
      }),
      f = loadFlight(flightFromWorld(world));
    let history = world.history,
      phase = 'climb',
      max = 0;
    f.stageNext();
    f.sas = true;
    try {
      for (let i = 0; i < 120 * 360 && !f.crashed; i++) {
        const com = f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),
          up = com.clone().sub(center).normalize(),
          target = deliverySitePosition(f.universalTime, site),
          delta = target.sub(com);
        delta.addScaledVector(up, -delta.dot(up));
        const d = descentTelemetry(f),
          v = surfaceRelativeVelocity(com, f.vel, f.universalTime),
          vertical = v.dot(up),
          horizontal = v.clone().addScaledVector(up, -vertical),
          distance = delta.length();
        if (phase === 'climb' && d.clearance > 120) phase = 'translate';
        if (phase === 'translate' && distance < 10 && horizontal.length() < 2) phase = 'descend';
        const desiredH =
            phase === 'climb' ? new T.Vector3() : delta.clone().multiplyScalar(0.25).clampLength(0, 20),
          aH = desiredH.sub(horizontal).multiplyScalar(0.65).clampLength(0, 2.5);
        const desiredV =
            phase === 'descend'
              ? -Math.min(3, Math.max(0.25, d.clearance * 0.3))
              : T.MathUtils.clamp((150 - d.clearance) * 0.5, -3, 10),
          acceleration = up
            .clone()
            .multiplyScalar(d.gravity + (desiredV - vertical) * 1.5)
            .add(aH);
        f.holdQ = new T.Quaternion().setFromUnitVectors(
          new T.Vector3(0, 1, 0),
          acceleration.clone().normalize()
        );
        f.throttle = T.MathUtils.clamp((acceleration.length() * f.stats.mass) / 45000, 0, 1);
        if (phase === 'descend' && f.telemetry.groundContact) f.throttle = 0;
        f.step(1 / 120);
        history = recordFlightChallenges(history, f);
        max = Math.max(max, d.clearance);

        if (history.some(e => e.type === 'precision-landing')) break;
      }
      assert.equal(f.crashed, false);
      assert.ok(f.landed);
      assert.ok(max > 100);
      assert.ok(f.fuelRatio > 0.1);
      const touchdown = history.find(e => e.type === 'flight-touchdown'),
        success = history.find(e => e.type === 'precision-landing');
      assert.equal(success?.siteId, site.id);
      assert.ok(touchdown.distance < site.radius);
      assert.ok(success.distance < site.radius);
      assert.deepEqual(success.flightEventIds, [touchdown.id]);
      assert.ok(success.speed < 0.5);
      const saved = validateWorld(JSON.parse(JSON.stringify(worldFromFlight(saveFlight(f), {history}))));
      assert.deepEqual(saved.history, history);
      const restored = loadFlight(flightFromWorld(saved));
      try {
        assert.equal(recordFlightChallenges(saved.history, restored), saved.history);
      } finally {
        restored.dispose();
      }
    } finally {
      f.dispose();
    }
  });
