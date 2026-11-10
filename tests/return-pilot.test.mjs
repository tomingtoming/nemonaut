import test from 'node:test';
import assert from 'node:assert/strict';
import {ReturnPilot, returnReadiness} from '../dist/runway-return-pilot.js';
import {landingFixture} from '../tools/landing-profile.mjs';
import {runReturnFlight} from '../tools/return-flight-profile.mjs';
import {RUNWAY} from '../dist/runway-navigation.js';
test('return control owns only its original aircraft and respects pause and manual release', () => {
  const f = landingFixture(),
    other = landingFixture();
  try {
    f.sas = true;
    f.sasMode = 'hold';
    f.trim = 0.17;
    const before = {pos: f.pos.clone(), vel: f.vel.clone(), q: f.q.clone(), throttle: f.throttle};
    const p = new ReturnPilot(f);
    assert.deepEqual({pos: f.pos, vel: f.vel, q: f.q, throttle: f.throttle}, before);
    assert.deepEqual(p.update(f, 0), {});
    assert.equal(p.progress, 0);
    assert.equal(p.elapsed, 0);
    p.update(f, 1 / 120);
    assert.equal(f.sas, false);
    p.update(f, 1 / 120, {manual: true});
    assert.equal(p.running, false);
    assert.equal(f.sas, true);
    assert.equal(f.trim, 0.17);
    const q = new ReturnPilot(f),
      otherPower = other.throttle;
    q.update(f, 1 / 120);
    q.update(other, 1 / 120);
    assert.equal(q.reason, 'vessel changed');
    assert.equal(other.throttle, otherPower);
    assert.equal(f.sas, true);
    const failed = new ReturnPilot(f);
    failed.update(f, NaN);
    assert.equal(failed.phase, 'failed');
    assert.equal(f.throttle, 0);
    f.telemetry.contacts = 1;
    assert.ok(returnReadiness(f));
    assert.throws(() => new ReturnPilot(f));
  } finally {
    f.dispose();
    other.dispose();
  }
});
for (const kind of ['plane', 'plane-large', 'transport-cargo'])
  for (const outboundHeading of [null, 210])
    test(`${kind} independently starts return control after outbound ${outboundHeading ?? 90}`, () => {
      const r = runReturnFlight({
        kind,
        standalone: true,
        outboundHeading,
        returnAfter: outboundHeading === null ? 0 : 200,
        seconds: 1100
      });
      assert.equal(r.result, 'stopped', JSON.stringify(r));
      assert.equal(r.crashed, false);
      assert.equal(r.landed, true);
      assert.equal(r.unexpectedContact, null);
      assert.equal(r.ownerUnchanged, true);
      assert.equal(r.initialParts, r.remainingParts);
      assert.ok(r.remainingFuel > 0 && r.remainingFuel < r.initialFuel);
      const start = r.events.find(e => e.phase === 'return:0');
      if (outboundHeading !== null) {
        assert.ok(start.time >= 200);
        assert.ok(Math.abs(start.heading - 210) < 20 && Math.abs(start.x) > 1000);
      }
      assert.ok(r.route.maxRouteError < 1000);
      assert.ok(r.handoff.remaining >= 5000 && r.handoff.remaining <= 10000);
      assert.ok(Math.abs(r.handoff.heading - 90) <= 15 && Math.abs(r.handoff.cross) <= 250);
      assert.ok(r.handoff.height >= 300 && r.handoff.height <= 400);
      for (const track of [r.departureTrack, r.landingTrack])
        assert.ok(track.minAlong >= 0 && track.maxAlong < RUNWAY.length && track.maxCross < RUNWAY.width / 2);
      assert.ok(r.landingTouch.impact > -3 && r.final.speed < 0.5);
    });
