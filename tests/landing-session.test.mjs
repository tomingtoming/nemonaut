import test from 'node:test';
import assert from 'node:assert/strict';
import {landingFixture} from '../tools/landing-profile.mjs';
import {landingPlanContext} from '../dist/landing-plan-client.js';
import {LandingSession, landingReadiness} from '../dist/landing-session.js';
import {LandingPrototype} from '../dist/landing-prototype.js';
// Synthetic plans exercise ownership only; flight performance is covered by
// landing-prototype and return-flight integration tests using computed plans.
const result = f => {
  const context = landingPlanContext(f);
  return {
    status: 'ready',
    context,
    plan: {
      speed: 90,
      alpha: 6,
      pitchCommand: -0.5,
      throttle: 0.5,
      density: context.density,
      gravity: 9.8,
      mass: context.mass,
      minimumSample: 86
    }
  };
};
const immediate = () => ({
  cancel() {},
  async request(f) {
    return result(f);
  }
});
test('capture envelope rejects ground, wrong heading and off-axis approaches', () => {
  const f = landingFixture();
  try {
    assert.equal(landingReadiness(f), null);
    assert.match(landingReadiness(f, '27'), /27端/);
    assert.match(landingReadiness(f, 'bad'), /着陸方向/);
    f.telemetry.contacts = 1;
    assert.match(landingReadiness(f), /飛行中/);
    f.telemetry.contacts = 0;
    f.q.multiply(f.q.clone().setFromAxisAngle({x: 0, y: 1, z: 0}, Math.PI));
    assert.match(landingReadiness(f), /整列/);
  } finally {
    f.dispose();
  }
  const outside = landingFixture({offset: 400});
  try {
    assert.match(landingReadiness(outside), /整列/);
  } finally {
    outside.dispose();
  }
});
test('preparation is read-only, late failures cannot erase newer ready plans', async () => {
  const f = landingFixture();
  const requests = [];
  const client = {
      cancel() {},
      request() {
        return new Promise((resolve, reject) => requests.push({resolve, reject}));
      }
    },
    s = new LandingSession(client);
  try {
    const before = {
      throttle: f.throttle,
      sas: f.sas,
      trim: f.trim,
      q: f.q.clone(),
      pos: f.pos.clone(),
      vel: f.vel.clone()
    };
    const old = s.prepare(f),
      current = s.prepare(f);
    requests[1].resolve(result(f));
    await current;
    requests[0].reject(Error('late failure'));
    assert.equal((await old).status, 'cancelled');
    assert.equal(s.state, 'ready');
    assert.deepEqual(
      {throttle: f.throttle, sas: f.sas, trim: f.trim, q: f.q, pos: f.pos, vel: f.vel},
      before
    );
    s.cancel();
    assert.equal(s.readyFor(f), false);
    assert.throws(() => s.start(f), /再準備/);
  } finally {
    s.stop();
    f.dispose();
  }
});

test('repreparing for the opposite runway end invalidates the previous ready plan', async () => {
  const f = landingFixture(),
    s = new LandingSession(immediate());
  try {
    await s.prepare(f, {end: '09'});
    assert.equal(s.readyFor(f), true);
    await assert.rejects(s.prepare(f, {end: '27'}), /27端/);
    assert.equal(s.readyFor(f), false);
    assert.equal(s.state, 'idle');
    assert.throws(() => s.start(f), /再準備/);
  } finally {
    s.stop();
    f.dispose();
  }
});
test('start revalidates geometry and vessel identity, pause and manual stop release control', async () => {
  const f = landingFixture(),
    other = landingFixture(),
    s = new LandingSession(immediate());
  try {
    await s.prepare(f);
    assert.equal(s.readyFor(other), false);
    await s.prepare(f);
    f.parts[0].controlEnabled = false;
    assert.throws(() => s.start(f), /再準備/);
    delete f.parts[0].controlEnabled;
    f.sas = true;
    f.sasMode = 'hold';
    f.trim = 0.2;
    await s.prepare(f);
    const pilot = s.start(f);
    const elapsed = pilot.elapsed,
      throttle = f.throttle;
    assert.deepEqual(s.step(f, 0), {});
    assert.equal(pilot.elapsed, elapsed);
    assert.equal(f.throttle, throttle);
    s.step(f, 1 / 120);
    assert.equal(f.sas, false);
    assert.deepEqual(s.step(f, 1 / 120, {manual: true}), {});
    assert.equal(s.state, 'idle');
    assert.equal(f.sas, true);
    assert.equal(f.trim, 0.2);
    f.throttle = 0.37;
    assert.deepEqual(s.step(f, 1 / 120), {});
    assert.equal(f.throttle, 0.37);
    await s.prepare(f);
    s.start(f);
    s.step(f, 1 / 120);
    const otherThrottle = other.throttle;
    assert.deepEqual(s.step(other, 1 / 120), {});
    assert.equal(f.sas, true);
    assert.equal(other.throttle, otherThrottle);
  } finally {
    s.stop();
    f.dispose();
    other.dispose();
  }
});
test('fault cuts thrust; completed rollout restores manual settings and keeps brakes', async () => {
  const f = landingFixture(),
    s = new LandingSession(immediate());
  try {
    await s.prepare(f);
    s.start(f);
    s.step(f, NaN);
    assert.equal(s.state, 'failed');
    assert.equal(f.throttle, 0);
    await s.prepare(f);
    const p = s.start(f);
    p.update = () => {
      p.phase = 'stopped';
      return {yaw: 1};
    };
    assert.deepEqual(s.step(f, 1 / 120), {});
    assert.equal(s.state, 'landed');
    assert.equal(f.throttle, 0);
    assert.equal(f.brake, true);
  } finally {
    s.stop();
    f.dispose();
  }
});
test('computed cargo approach completes through session ownership and releases only at rest', async () => {
  const f = landingFixture({kind: 'transport-cargo'});
  const plan = new LandingPrototype(f).trimPlan,
    context = landingPlanContext(f);
  const s = new LandingSession({
    cancel() {},
    async request() {
      return {status: 'ready', plan, context};
    }
  });
  try {
    f.sas = true;
    f.sasMode = 'hold';
    f.trim = 0.1;
    await s.prepare(f);
    const pilot = s.start(f);
    for (let i = 0; i < 180 * 120 && s.pilot; i++) f.step(1 / 120, s.step(f, 1 / 120));
    assert.equal(s.state, 'landed');
    assert.equal(f.crashed, false);
    assert.equal(f.landed, true);
    assert.ok(pilot.track.minAlong >= 0 && pilot.track.maxAlong <= 1600 && pilot.track.maxCross <= 9);
    assert.ok(s.telemetry.speed < 0.5);
    assert.equal(f.throttle, 0);
    assert.equal(f.brake, true);
    assert.equal(f.sas, true);
    assert.equal(f.trim, 0.1);
  } finally {
    s.stop();
    f.dispose();
  }
});
