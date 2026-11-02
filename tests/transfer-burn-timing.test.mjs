import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {transferBurnTiming} from '../dist/timed-rendezvous.js';
test('Burn timing uses active connected fuel without consuming live propellant and rejects unavailable propulsion', () => {
  const f = new Flight(preset('rocket'), 'orbit');
  try {
    assert.throws(() => transferBurnTiming(f, 30));
    f.stageNext();
    const fuel = [...f.fuel],
      mass = f.stats.mass;
    const burn = transferBurnTiming(f, 30);
    assert.ok(burn.offset > 0 && burn.offset < burn.duration);
    assert.ok(burn.delivered >= 29.95 && burn.delivered <= 30.1);
    assert.deepEqual([...f.fuel], fuel);
    assert.equal(f.stats.mass, mass);
    f.throttle = 0.1;
    assert.throws(() => transferBurnTiming(f, 30));
    f.throttle = 0;
    for (const id of f.fuel.keys()) f.fuel.set(id, 0);
    assert.throws(() => transferBurnTiming(f, 30));
  } finally {
    f.dispose();
  }
});

test('Fixed ten percent timing matches its burn profile and rejects invalid thrust', () => {
  const f = new Flight(preset('orbital-tug'), 'orbit');
  try {
    f.stageNext();
    const fuel = [...f.fuel],
      taper = transferBurnTiming(f, 34.4),
      fixed = transferBurnTiming(f, 34.4, {burnThrottle: 0.1});
    assert.ok(fixed.duration > 18 && fixed.duration < 21);
    assert.ok(fixed.offset > 9 && fixed.offset < 11);
    assert.ok(fixed.duration > taper.duration * 3);
    assert.equal(fixed.burnThrottle, 0.1);
    assert.equal(taper.burnThrottle, null);
    assert.deepEqual([...f.fuel], fuel);
    for (const burnThrottle of [0, -0.1, 1.1, NaN, Infinity, '0.1'])
      assert.throws(() => transferBurnTiming(f, 34.4, {burnThrottle}));
  } finally {
    f.dispose();
  }
});
