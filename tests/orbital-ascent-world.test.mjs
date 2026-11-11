import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {WorldRuntime} from '../dist/world-runtime.js';
import {AscentSession} from '../dist/ascent-session.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import {maneuverPreview} from '../dist/maneuver.js';
import {createManeuverNode} from '../dist/maneuver-node.js';
import {ManeuverSession} from '../dist/maneuver-session.js';
test('automatic ascent stages before registry refresh, advances every vessel on the same clock and hands off to a planned burn without resetting the world', () => {
  const f = new Flight(preset('launcher'), 'land', 1413.8),
    other = new Flight(preset('rover'), 'land', 1413.8);
  other.pos.x += 1000;
  f.detached.push(other);
  const world = new WorldRuntime(f),
    session = new AscentSession();
  let restored;
  const originalIds = [...f.parts, ...other.parts].map(p => p.id).sort();
  try {
    session.start(f, {altitude: 120000, inclination: 90});
    for (let i = 0; i < 1201 * 120 && session.owner; i++) {
      session.step(f, 1 / 120);
      world.replace(f);
      world.step(1 / 120);
    }
    assert.equal(session.state, 'complete');
    assert.equal(f.stage, 1);
    assert.ok(world.vessels.size >= 3);
    assert.deepEqual([...world.vessels.values()].flatMap(v => v.parts.map(p => p.id)).sort(), originalIds);
    assert.equal(world.vessels.get(other.vesselId), other);
    for (const v of world.vessels.values()) assert.equal(v.universalTime, world.universalTime);
    assert.ok(f.orbit.periapsis >= 118000);
    assert.ok(f.orbit.apoapsis <= 122000);
    restored = loadFlight(saveFlight(f));
    const saved = new WorldRuntime(restored);
    assert.equal(saved.vessels.size, world.vessels.size);
    assert.equal(saved.universalTime, world.universalTime);
    restored.dispose();
    restored = null;
    // The same world then flies a planned 30 m/s burn, without being reset.
    const epoch = world.universalTime,
      fuel = f.fuelRatio,
      maneuver = new ManeuverSession();
    f.maneuver = createManeuverNode(
      maneuverPreview(
        f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),
        f.vel,
        {universalTime: epoch + 90},
        30,
        epoch
      ),
      f.time
    );
    maneuver.start(f, {throttle: 0.1});
    for (let i = 0; i < 180 * 120 && maneuver.owner; i++) {
      maneuver.step(f, 1 / 120);
      world.replace(f);
      world.step(1 / 120);
    }
    assert.equal(maneuver.state, 'complete', maneuver.message);
    assert.ok(world.universalTime > epoch + 90);
    assert.equal(f.stage, 1);
    assert.deepEqual([...world.vessels.values()].flatMap(v => v.parts.map(p => p.id)).sort(), originalIds);
    assert.ok(f.fuelRatio < fuel);
    assert.equal(f.throttle, 0);
    assert.ok(f.orbit.periapsis > 70000);
    for (const v of world.vessels.values()) assert.equal(v.universalTime, world.universalTime);
    restored = loadFlight(saveFlight(f));
    assert.equal(restored.maneuver.complete, true);
    assert.equal(restored.throttle, 0);
  } finally {
    restored?.dispose();
    f.dispose();
  }
});
