import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';
import {preset, part} from '../dist/catalog.js';
import {WorldRuntime} from '../dist/world-runtime.js';
import {worldFromFlight, flightFromWorld} from '../dist/world-save.js';
import {launchWorld} from '../dist/world-operations.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import {VESSEL_COLLISION} from '../dist/vessel-collision.js';

const floatplane = jetHeight => {
  const parts = preset('plane').filter(p => !['nosegear', 'maingear'].includes(p.type));
  parts.find(p => p.type === 'jet').p[1] = jetHeight;
  for (const x of [-1.4, 1.4])
    for (const z of [-1.2, 2]) {
      const float = part('pontoon', [x, -0.3, z], [Math.PI / 2, 0, 0]);
      float.parent = parts[1].id;
      parts.push(float);
    }
  return parts;
};

test('water relaunch preserves wreck hazards; the same epoch in a clear world is safe', () => {
  const old = new Flight(floatplane(1.3), 'water');
  let saved;
  try {
    const world = new WorldRuntime(old);
    old.stageNext();
    old.throttle = 1;
    for (let i = 0; i < 3600; i++) world.step(1 / 120);
    saved = worldFromFlight(saveFlight(old));
    assert.ok(old.failureEvents.length > 0);
    assert.ok(saved.vessels.length > 1);
  } finally {
    old.dispose();
  }
  const previousObserver = VESSEL_COLLISION.onContact;
  try {
    for (const wrecks of [true, false]) {
      const source = wrecks ? saved : worldFromFlight(null, {universalTime: saved.universalTime});
      const oldIds = new Set(source.vessels.map(v => v.vesselId));
      const f = loadFlight(
        flightFromWorld(launchWorld(source, {parts: floatplane(0.8), environment: 'water', name: 'Next'}))
      );
      try {
        const world = new WorldRuntime(f),
          contacts = [];
        assert.equal(world.universalTime, saved.universalTime);
        assert.equal(oldIds.has(f.vesselId), false);
        for (const id of oldIds) assert.ok(world.vessels.has(id));
        VESSEL_COLLISION.onContact = event => {
          if (
            (event.a === f.vesselId && oldIds.has(event.b)) ||
            (event.b === f.vesselId && oldIds.has(event.a))
          )
            contacts.push(event);
        };
        f.stageNext();
        f.throttle = 1;
        for (let i = 0; i < 7200 && !f.failureEvents.length; i++) world.step(1 / 120);
        if (wrecks) {
          assert.ok(contacts.some(c => c.speed > VESSEL_COLLISION.impactSpeed));
          assert.ok(f.failureEvents.some(e => e.cause === 'impact'));
          assert.ok(f.time > 1 && f.time < 30, 'collision occurs after leaving the launch envelope');
        } else {
          assert.equal(contacts.length, 0);
          assert.equal(f.failureEvents.length, 0);
          assert.ok(f.time > 59.9);
          assert.equal(f.parts.length, 17);
        }
      } finally {
        f.dispose();
      }
    }
  } finally {
    VESSEL_COLLISION.onContact = previousObserver;
  }
});
