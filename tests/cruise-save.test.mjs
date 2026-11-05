import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {
  CruisePilot,
  cruiseAuthority,
  cruisePropulsion,
  cruiseSettings,
  cruiseReadiness,
  cruiseTargetReadiness
} from '../dist/cruise-pilot.js';
import {selectVessel} from '../dist/fleet.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import {bodyUp} from '../dist/celestial.js';
test('cruise target admission rejects low lift at speed and altitude without mutating the aircraft', () => {
  for (const kind of ['plane', 'plane-large', 'transport-cargo']) {
    const f = new Flight(preset(kind), 'runway');
    try {
      const q = f.q.clone(),
        vel = f.vel.clone(),
        fuel = [...f.fuel];
      assert.match(cruiseTargetReadiness(f, {speed: 40, altitude: 1000}), /巡航速度不足/);
      assert.equal(cruiseTargetReadiness(f, {speed: kind === 'plane' ? 120 : 90, altitude: 1000}), null);
      assert.match(cruiseTargetReadiness(f, {speed: 90, altitude: 15000}), /巡航速度不足/);
      assert.deepEqual(f.q, q);
      assert.deepEqual(f.vel, vel);
      assert.deepEqual([...f.fuel], fuel);
    } finally {
      f.dispose();
    }
  }
});
test('cruise stops on lost fuel supply, disabled thrust or shutdown without moving the aircraft', () => {
  for (const failure of ['empty', 'isolated', 'limited', 'shutdown']) {
    const f = new Flight(preset('plane'), 'runway');
    try {
      f.stageNext();
      f.vel.z += 120;
      f.throttle = 0.5;
      const pilot = new CruisePilot(f);
      pilot.update(f, 0.1);
      assert.equal(pilot.running, true);
      if (failure === 'empty') for (const id of f.fuel.keys()) f.fuel.set(id, 0);
      if (failure === 'isolated') for (const p of f.parts) p.fuelEnabled = false;
      if (failure === 'limited') for (const p of f.parts) p.thrustLimit = 0;
      if (failure === 'shutdown') f.active.clear();
      const pos = f.pos.clone(),
        vel = f.vel.clone();
      pilot.update(f, 0.1);
      assert.equal(pilot.running, false, failure);
      assert.match(pilot.faultMessage, /燃料供給/);
      assert.equal(f.throttle, 0);
      assert.deepEqual(f.pos, pos);
      assert.deepEqual(f.vel, vel);
    } finally {
      f.dispose();
    }
  }
});
test('switching the fleet root cannot apply the previous aircraft cruise commands', () => {
  const a = new Flight(preset('plane'), 'runway'),
    b = new Flight(preset('plane-large'), 'runway');
  let root = a,
    restored;
  try {
    a.stageNext();
    a.vel.z += 120;
    a.cruiseSettings = cruiseSettings({speed: 120, altitude: 1000, heading: 90});
    b.cruiseSettings = cruiseSettings({speed: 90, altitude: 800, heading: 180});
    a.detached.push(b);
    const pilot = new CruisePilot(a, a.cruiseSettings);
    pilot.update(a, 0.1);
    root = selectVessel(a, b);
    b.throttle = 0.21;
    b.trim = 0.13;
    const q = b.holdQ.clone();
    pilot.update(b, 0.1);
    assert.equal(pilot.running, false);
    assert.equal(b.throttle, 0.21);
    assert.equal(b.trim, 0.13);
    assert.deepEqual(b.holdQ, q);
    restored = loadFlight(saveFlight(root));
    assert.deepEqual(restored.cruiseSettings, b.cruiseSettings);
    assert.deepEqual(restored.detached[0].cruiseSettings, a.cruiseSettings);
  } finally {
    restored?.dispose();
    root.dispose();
  }
});
test('paused restored aircraft can start cruise without a transient thrust sample', () => {
  const f = new Flight(preset('plane'), 'runway');
  let restored;
  try {
    f.stageNext();
    f.pos.addScaledVector(bodyUp(f.pos, f.universalTime), 1000);
    f.vel.z += 120;
    f.throttle = 0;
    restored = loadFlight(saveFlight(f));
    assert.equal(restored.engineThrust.size, 0);
    assert.equal(cruiseReadiness(restored), null);
    for (const id of restored.fuel.keys()) restored.fuel.set(id, 0);
    assert.match(cruiseReadiness(restored), /燃料供給/);
  } finally {
    restored?.dispose();
    f.dispose();
  }
});
test('cruise targets survive per-vessel save without serializing a running controller', () => {
  const f = new Flight(preset('plane'), 'runway');
  let restored;
  try {
    f.cruiseSettings = cruiseSettings({
      speed: 120,
      altitude: 1200,
      heading: 91,
      mode: 'vertical',
      vertical: 2
    });
    const child = new Flight(preset('plane-large'), 'runway');
    child.cruiseSettings = cruiseSettings({speed: 100, altitude: 900, heading: 180});
    f.detached.push(child);
    const data = saveFlight(f);
    restored = loadFlight(data);
    assert.deepEqual(restored.cruiseSettings, f.cruiseSettings);
    assert.deepEqual(restored.detached[0].cruiseSettings, child.cruiseSettings);
    assert.equal(restored.cruiseActive, undefined);
    assert.equal(data.cruiseActive, undefined);
    data.cruiseSettings.speed = NaN;
    assert.throws(() => loadFlight(data));
  } finally {
    restored?.dispose();
    f.dispose();
  }
});
test('cruise rejects unsupported aircraft and out-of-range targets', () => {
  const f = new Flight(preset('plane'), 'runway');
  try {
    assert.match(cruiseReadiness(f), /離陸/);
    f.parts.forEach(p => (p.controlEnabled = false));
    assert.match(cruiseReadiness(f), /昇降舵/);
    for (const patch of [{heading: 360}, {speed: 10}, {altitude: 0}, {vertical: 11}, {mode: 'bad'}])
      assert.throws(() => cruiseSettings({speed: 100, altitude: 1000, heading: 90, ...patch}));
  } finally {
    f.dispose();
  }
});

test('an uncrewed twin jet needs working surfaces and net forward thrust', () => {
  const craft = preset('plane-large');
  craft.find(p => p.type === 'cockpitLarge').type = 'probe';
  const f = new Flight(craft, 'runway');
  try {
    f.stageNext();
    assert.equal(cruiseAuthority(f), null);
    assert.equal(cruisePropulsion(f), null);
    const engines = f.parts.filter(p => p.type === 'jetLarge');
    engines[0].r = [-Math.PI / 2, 0, 0];
    assert.match(cruisePropulsion(f), /前方/);
    engines[0].thrustLimit = 0.5;
    assert.equal(cruisePropulsion(f), null);
    for (const p of f.parts) p.controlEnabled = false;
    assert.match(cruiseAuthority(f), /昇降舵/);
  } finally {
    f.dispose();
  }
});
