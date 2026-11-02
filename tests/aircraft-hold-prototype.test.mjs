import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {AircraftHoldPrototype} from '../tools/aircraft-hold-prototype.mjs';

test('loss of enabled control surfaces releases cruise and restores manual settings', () => {
  const f = new Flight(preset('plane'), 'runway');
  try {
    f.stageNext();
    f.vel.z += 120;
    f.sas = false;
    f.trim = 0.12;
    f.throttle = 0.5;
    const pilot = new AircraftHoldPrototype(f);
    pilot.update(f, 1 / 120);
    assert.equal(pilot.running, true);
    f.parts.forEach(p => (p.controlEnabled = false));
    const q = f.q.clone(),
      vel = f.vel.clone();
    pilot.update(f, 1 / 120);
    assert.equal(pilot.running, false);
    assert.match(pilot.faultMessage, /昇降舵/);
    assert.equal(f.sas, false);
    assert.equal(f.trim, 0.12);
    assert.equal(f.throttle, 0);
    assert.deepEqual(f.q, q);
    assert.deepEqual(f.vel, vel);
  } finally {
    f.dispose();
  }
});

test('experimental guidance commands actuators without changing physical state; pause and manual release are explicit', () => {
  const f = new Flight(preset('plane'), 'runway');
  try {
    f.stageNext();
    f.sas = false;
    f.trim = 0.12;
    f.sasMode = 'prograde';
    f.throttle = 0.5;
    // Controlled moving state: this guidance is not a takeoff controller.
    f.vel.z += 120;
    const p = new AircraftHoldPrototype(f),
      pos = f.pos.clone(),
      vel = f.vel.clone(),
      q = f.q.clone(),
      omega = f.omega.clone();
    p.update(f, 0);
    assert.equal(f.sas, false);
    assert.equal(f.trim, 0.12);
    assert.equal(f.throttle, 0.5);
    p.update(f, 1 / 120);
    assert.equal(f.sas, true);
    assert.equal(f.sasMode, 'hold');
    assert.deepEqual(f.pos, pos);
    assert.deepEqual(f.vel, vel);
    assert.deepEqual(f.q, q);
    assert.deepEqual(f.omega, omega);
    f.throttle = 0.23;
    p.update(f, 1 / 120, {manual: true});
    assert.equal(p.running, false);
    assert.equal(f.throttle, 0.23);
    assert.equal(f.sas, false);
    assert.equal(f.trim, 0.12);
    assert.equal(f.sasMode, 'prograde');
    assert.ok(f.holdQ.angleTo(q) < 1e-7);
    p.update(f, 1);
    assert.equal(f.throttle, 0.23);
  } finally {
    f.dispose();
  }
});
test('guidance rejects zero aerodynamic authority without injecting motion', () => {
  const f = new Flight(preset('plane'), 'runway');
  try {
    f.stageNext();
    f.stats.aero.weight = 0;
    const pos = f.pos.clone(),
      q = f.q.clone(),
      p = new AircraftHoldPrototype(f);
    p.update(f, 1 / 120);
    assert.equal(p.running, false);
    assert.equal(f.throttle, 0);
    assert.deepEqual(f.pos, pos);
    assert.deepEqual(f.q, q);
  } finally {
    f.dispose();
  }
});
test('experimental owner does not write to another vessel and rejects nonfinite guidance', () => {
  const a = new Flight(preset('plane'), 'runway'),
    b = new Flight(preset('plane-large'), 'runway');
  try {
    const p = new AircraftHoldPrototype(a);
    b.throttle = 0.37;
    b.trim = 0.1;
    p.update(b, 1 / 120);
    assert.equal(p.running, false);
    assert.equal(b.throttle, 0.37);
    assert.equal(b.trim, 0.1);
    const invalid = new AircraftHoldPrototype(a);
    invalid.target.altitude = NaN;
    a.throttle = 0.8;
    invalid.update(a, 1 / 120);
    assert.equal(invalid.running, false);
    assert.equal(invalid.reason, 'fault');
    assert.equal(a.throttle, 0);
    assert.throws(() => new AircraftHoldPrototype(a, {speed: NaN}));
    assert.throws(() => new AircraftHoldPrototype({parts: [], stats: {mass: 0}}));
  } finally {
    a.dispose();
    b.dispose();
  }
});
