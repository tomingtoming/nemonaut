import test from 'node:test';
import assert from 'node:assert/strict';
import {landingFixture} from '../tools/landing-profile.mjs';
import {LandingPrototype} from '../dist/landing-prototype.js';
import {LandingSession} from '../dist/landing-session.js';
import {landingPlanContext} from '../dist/landing-plan-client.js';
for (const kind of ['plane', 'plane-large', 'transport-cargo'])
  test(`${kind} abandons low final and recovers level flight without contact`, async () => {
    const f = landingFixture({kind}),
      plan = new LandingPrototype(f).trimPlan,
      context = landingPlanContext(f);
    const s = new LandingSession({
      cancel() {},
      async request() {
        return {status: 'ready', plan, context};
      }
    });
    let requested = false,
      contact = false,
      settled = 0,
      minHeight = Infinity;
    try {
      await s.prepare(f);
      s.start(f);
      for (let i = 0; i < 360 * 120 && s.pilot; i++) {
        if (!requested && s.telemetry?.agl < 60) {
          assert.equal(s.goAround(f), true);
          assert.equal(s.goAround(f), false);
          requested = true;
        }
        f.step(1 / 120, s.step(f, 1 / 120));
        contact ||= f.telemetry.contacts > 0;
        if (requested) minHeight = Math.min(minHeight, s.telemetry?.agl ?? s.telemetry?.height ?? Infinity);
        settled = s.pilot?.phase === 'recovery-hold' ? settled + 1 / 120 : 0;
        if (settled > 10) break;
      }
      assert.ok(requested);
      assert.equal(f.crashed, false);
      assert.equal(contact, false);
      assert.ok(minHeight > 10);
      assert.ok(settled > 10, JSON.stringify({phase: s.pilot?.phase, telemetry: s.telemetry}));
      assert.ok(Math.abs(s.telemetry.height - 600) < 10);
      assert.ok(Math.abs(s.telemetry.vertical) < 0.5);
      assert.ok(f.throttle < 0.95);
      assert.equal(s.goAround(f), false);
      s.stop();
      assert.equal(s.pilot, null);
      assert.equal(f.sas, true);
    } finally {
      s.stop();
      f.dispose();
    }
  });
