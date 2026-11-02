import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {preset} from '../dist/catalog.js';
import {launchWorld} from '../dist/world-operations.js';
import {worldFromFlight, flightFromWorld, validateWorld} from '../dist/world-save.js';
import {loadFlight, saveFlight} from '../dist/flight-save.js';
import {DELIVERY_SITES, deliverySitePosition, deliveryDistance} from '../dist/delivery-sites.js';
import {deliveryTelemetry, recordDeliveryAchievements} from '../dist/surface-delivery.js';
import {advanceCoastFleet} from '../dist/coast-flight.js';
import {PRIMARY_ROTATION_PERIOD} from '../dist/surface-frame.js';
import {powerTotals} from '../dist/power.js';
import {recordSurveyAchievement} from '../dist/surface-survey.js';
import {fleet} from '../dist/fleet.js';
for (const site of DELIVERY_SITES)
  test('Courier drives, installs, observes and saves at ' + site.id, () => {
    const world = launchWorld(worldFromFlight(null), {
        parts: preset('courier'),
        name: 'Courier',
        environment: 'land'
      }),
      f = loadFlight(flightFromWorld(world));
    try {
      f.sas = false;
      f.stageNext();
      assert.equal(f.brake, false);
      f.throttle = 0.5;
      let stopped = false;
      for (let i = 0; i < 120 * 600 && !f.crashed; i++) {
        const target = deliverySitePosition(f.universalTime, site)
            .sub(f.pos)
            .applyQuaternion(f.q.clone().invert()),
          angle = Math.atan2(target.x, target.z),
          distance = deliveryDistance(f.pos, f.universalTime, site);
        if (distance < 12) {
          f.throttle = 0;
          f.brake = true;
          stopped = true;
        }
        f.step(1 / 120, {yaw: stopped ? 0 : Math.max(-1, Math.min(1, angle * 2))});

        if (stopped && f.landed) break;
      }
      f.throttle = 0;
      f.brake = true;
      for (let i = 0; i < 600; i++) f.step(1 / 120);
      assert.ok(stopped);
      assert.equal(f.crashed, false);
      assert.equal(deliveryTelemetry(f, world.history, {site}).reason, '運搬機から分離');
      assert.equal(recordDeliveryAchievements(world.history, f), world.history);
      f.stageNext();
      assert.ok(fleet(f).every(v => v.brake));
      for (let i = 0; i < 1200; i++) f.step(1 / 120);
      assert.equal(f.crashed, false);
      assert.ok(f.landed);
      assert.ok(deliveryTelemetry(f, world.history, {site}).ready);
      assert.equal(f.parts.length, 3);
      assert.equal(powerTotals(f.parts, f.charge).capacity, 1200);
      assert.equal(powerTotals(f.detached[0].parts, f.detached[0].charge).capacity, 200);
      assert.equal(f.detached.length, 1);
      const history = recordDeliveryAchievements(world.history, f);
      assert.equal(history.at(-1).type, 'delivery');
      assert.equal(history.at(-1).siteId, site.id);
      f.observations.get(f.parts.find(p => p.type === 'probe').id).enabled = true;
      let remaining = PRIMARY_ROTATION_PERIOD;
      while (remaining > 1e-6) {
        const result = advanceCoastFleet(f, Math.min(300, remaining));
        assert.equal(
          result.reason,
          null,
          JSON.stringify({
            result,
            vessels: fleet(f).map(v => ({
              parts: v.parts.length,
              brake: v.brake,
              landed: v.landed,
              landedTime: v.landedTime,
              vel: v.vel.toArray(),
              omega: v.omega.toArray(),
              pos: v.pos.toArray(),
              com: v.stats.com.toArray()
            }))
          })
        );
        assert.ok(result.advanced > 0);
        remaining -= result.advanced;
      }
      const completed = recordSurveyAchievement(history, f);
      assert.equal(completed.at(-1).type, 'survey');
      assert.equal(completed.at(-1).siteId, site.id);
      if (site.id === 'east-station') {
        const data = f.observations.get(f.parts[0].id);
        assert.equal(data.day, 0);
        assert.equal(data.night, 0);
        assert.ok(data.sites[site.id].day >= 9000 && data.sites[site.id].night >= 9000);
      }
      assert.ok(powerTotals(f.parts, f.charge).stored > 0);
      const saved = validateWorld(
        JSON.parse(JSON.stringify(worldFromFlight(saveFlight(f), {history: completed})))
      );
      assert.equal(saved.vessels.length, 2);
      assert.deepEqual(saved.history, completed);
      const restored = loadFlight(flightFromWorld(saved));
      try {
        assert.equal(recordDeliveryAchievements(saved.history, restored), saved.history);
        assert.deepEqual([...restored.observations], [...f.observations]);
      } finally {
        restored.dispose();
      }
    } finally {
      f.dispose();
    }
  });

test('Courier remains upright during a full-key steering correction at cruising speed', () => {
  const w = launchWorld(worldFromFlight(null), {
      parts: preset('courier'),
      name: 'Steering',
      environment: 'land'
    }),
    f = loadFlight(flightFromWorld(w));
  try {
    f.sas = false;
    f.stageNext();
    for (let i = 0; i < 25 * 120; i++) f.step(1 / 120, {drive: 1});
    for (let i = 0; i < 10 * 120; i++) {
      f.step(1 / 120, {drive: 1, yaw: 1});
      const up = f.pos
        .clone()
        .add(new T.Vector3(0, 600000, 0))
        .normalize();
      assert.ok(new T.Vector3(0, 1, 0).applyQuaternion(f.q).dot(up) > 0.7);
      assert.equal(f.crashed, false);
    }
    const wheel = f.parts.find(p => p.type === 'wheel' && p.steeringEnabled !== false);
    assert.ok(Math.abs(f.wheelMotion.get(wheel.id).steer) < 0.2);
  } finally {
    f.dispose();
  }
});
