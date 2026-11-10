import test from 'node:test';
import assert from 'node:assert/strict';
import {ReturnSession} from '../dist/return-session.js';
import {ReturnPilot} from '../dist/runway-return-pilot.js';
import {landingFixture} from '../tools/landing-profile.mjs';
import {landingPlanContext} from '../dist/landing-plan-client.js';
import {LandingPrototype} from '../dist/landing-prototype.js';
const ready = f => ({
  status: 'ready',
  plan: new LandingPrototype(f).trimPlan,
  context: landingPlanContext(f)
});
// Enter at the capture boundary to isolate asynchronous ownership from route
// performance (covered by return-pilot integration tests).
function capture(s, f) {
  const pilot = s.start(f);
  pilot.update = () => {
    pilot.phase = 'capture';
    return {};
  };
  s.step(f, 1 / 120);
}
test('late planning results and errors cannot restart a cancelled or replaced return', async () => {
  const f = landingFixture(),
    requests = [];
  const s = new ReturnSession({
    cancel() {},
    request() {
      return new Promise((resolve, reject) => requests.push({resolve, reject}));
    }
  });
  try {
    capture(s, f);
    const old = s.pending;
    s.stop();
    capture(s, f);
    const current = s.pending;
    requests[0].reject(Error('old failure'));
    await old;
    assert.equal(s.state, 'planning');
    requests[1].resolve(ready(f));
    await current;
    assert.equal(s.landing.state, 'ready');
    assert.equal(s.landing.pilot, null);
    s.step(f, 0);
    assert.equal(s.landing.pilot, null);
    s.step(f, 1 / 120);
    assert.ok(s.landing.pilot);
    assert.equal(s.state, 'approach');
    s.step(f, 1 / 120, {manual: true});
    assert.equal(s.owner, null);
    assert.equal(s.landing.pilot, null);
  } finally {
    s.stop();
    f.dispose();
  }
});
test('stale preparation recovers without cutting throttle or waiting on another plan', async () => {
  const f = landingFixture(),
    s = new ReturnSession({
      cancel() {},
      async request() {
        return {status: 'stale'};
      }
    });
  try {
    capture(s, f);
    const throttle = f.throttle;
    await s.pending;
    assert.equal(s.state, 'recovery');
    assert.equal(s.pilot.phase, 'recovery');
    assert.equal(f.throttle, throttle);
    assert.equal(s.pilot.driver.cruise.target.altitude, 600);
    assert.equal(s.pending, null);
  } finally {
    s.stop();
    f.dispose();
  }
});
test('passing the preparation window cancels pending work; switching vessels leaves the new vessel untouched', async () => {
  const f = landingFixture(),
    other = landingFixture();
  let resolve;
  const s = new ReturnSession({
    cancel() {},
    request() {
      return new Promise(r => {
        resolve = r;
      });
    }
  });
  try {
    f.sas = true;
    f.trim = 0.21;
    capture(s, f);
    const pending = s.pending;
    s.pilot.update = () => {
      s.pilot.recover('window passed');
      return {};
    };
    s.step(f, 1 / 120);
    assert.equal(s.state, 'recovery');
    assert.equal(s.pending, null);
    resolve(ready(f));
    await pending;
    assert.equal(s.landing.pilot, null);
    assert.equal(s.landing.state, 'idle');
    const untouched = {
      throttle: other.throttle,
      sas: other.sas,
      trim: other.trim,
      pos: other.pos.clone(),
      vel: other.vel.clone()
    };
    s.step(other, 1 / 120);
    assert.equal(s.owner, null);
    assert.equal(f.sas, true);
    assert.equal(f.trim, 0.21);
    assert.deepEqual(
      {throttle: other.throttle, sas: other.sas, trim: other.trim, pos: other.pos, vel: other.vel},
      untouched
    );
  } finally {
    s.stop();
    f.dispose();
    other.dispose();
  }
});
test('prepared capture hands ownership to landing and restores original settings at touchdown', async () => {
  const f = landingFixture({kind: 'transport-cargo'}),
    s = new ReturnSession({
      cancel() {},
      async request() {
        return ready(f);
      }
    });
  try {
    f.sas = true;
    f.sasMode = 'hold';
    f.trim = 0.13;
    capture(s, f);
    await s.pending;
    for (let i = 0; i < 180 * 120 && s.owner; i++) f.step(1 / 120, s.step(f, 1 / 120));
    assert.equal(s.state, 'landed');
    assert.equal(f.crashed, false);
    assert.equal(f.landed, true);
    assert.equal(f.sas, true);
    assert.equal(f.trim, 0.13);
    assert.equal(f.throttle, 0);
    assert.equal(f.brake, true);
  } finally {
    s.stop();
    f.dispose();
  }
});
for (const kind of ['plane', 'plane-large', 'transport-cargo'])
  test(`${kind} holds 600m after failed approach preparation`, () => {
    const f = landingFixture({kind}),
      pilot = new ReturnPilot(f);
    pilot.recover('test unavailable');
    let held = 0;
    try {
      for (let i = 0; i < 240 * 120 && held < 10; i++) {
        f.step(1 / 120, pilot.update(f, 1 / 120));
        assert.equal(f.crashed, false);
        assert.equal(f.telemetry.contacts, 0);
        assert.equal(pilot.running, true);
        held = pilot.phase === 'recovery-hold' ? held + 1 / 120 : 0;
      }
      assert.ok(held >= 10, JSON.stringify(pilot.telemetry));
      assert.ok(Math.abs(pilot.telemetry.height - 600) < 10 && Math.abs(pilot.telemetry.vertical) < 0.5);
      assert.ok(f.throttle > 0 && f.throttle < 0.95);
    } finally {
      pilot.stop();
      f.dispose();
    }
  });
test('physical final approach passes its endpoint and recovers when no landing plan arrives', () => {
  const f = landingFixture({offset: 0}),
    pilot = new ReturnPilot(f);
  // Fixture is already on final. Mark the geometric route complete without
  // changing the aircraft pose, then let physical motion leave the capture area.
  pilot.progress = pilot.route.length;
  let held = 0,
    sawRecovery = false;
  try {
    for (let i = 0; i < 240 * 120 && held < 10; i++) {
      f.step(1 / 120, pilot.update(f, 1 / 120));
      assert.equal(pilot.running, true);
      assert.equal(f.crashed, false);
      assert.equal(f.telemetry.contacts, 0);
      sawRecovery ||= pilot.phase === 'recovery';
      held = pilot.phase === 'recovery-hold' ? held + 1 / 120 : 0;
    }
    assert.equal(sawRecovery, true);
    assert.ok(held >= 10);
    assert.match(pilot.recoveryReason, /範囲を通過/);
    assert.ok(f.throttle > 0);
  } finally {
    pilot.stop();
    f.dispose();
  }
});
