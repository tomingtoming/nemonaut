import test from 'node:test';
import assert from 'node:assert/strict';
import {RolloutControl} from '../dist/rollout-control.js';
import * as T from 'three';
import {landingFixture} from '../tools/landing-profile.mjs';
import {LandingPrototype} from '../dist/landing-prototype.js';
import {PRIMARY, bodyState} from '../dist/celestial.js';
import {
  surfaceAngularVelocity,
  surfaceOrientation,
  launchSiteOrientation,
  surfaceRelativeVelocity,
  surfaceVelocity
} from '../dist/surface-frame.js';
import {RUNWAY, runwayApproach} from '../dist/runway-navigation.js';
test('limited runway or high speed demands immediate braking and latches it', () => {
  for (const [speed, remaining] of [
    [90, 700],
    [150, 1700],
    [40, 100]
  ]) {
    const c = new RolloutControl();
    assert.equal(c.step({speed, pitchRate: -10, remaining}, 1 / 120).brake, true);
    assert.equal(c.step({speed: 0, pitchRate: 0, remaining: 5000}, 1 / 120).brake, true);
  }
});
test('runway reserve permits bounded delay; pause does not consume it', () => {
  const c = new RolloutControl(),
    state = {speed: 70, pitchRate: -10, remaining: 1400};
  assert.equal(c.step(state, 0).brake, false);
  assert.equal(c.elapsed, 0);
  for (let i = 0; i < 10; i++) assert.equal(c.step(state, 0.1).brake, false);
  // Floating-point accumulation can leave a tiny positive delay at 1 second.
  c.step(state, 0.01);
  assert.equal(c.step(state, 0.01).brake, true);
  assert.equal(c.step(state, 0).pitch, -0.5);
});
test('non-finite observations fail to braking instead of producing NaN commands', () => {
  for (const key of ['speed', 'pitchRate', 'remaining']) {
    const state = {speed: 70, pitchRate: 0, remaining: 1400, [key]: NaN};
    assert.deepEqual(new RolloutControl().step(state, 0.01), {brake: true, pitch: 0, invalid: true});
  }
});
// Flies the landing guidance from the airborne approach fixture to its end and records every
// sample with wheel contact. `touchdownAlong` (m from the threshold) makes a late touchdown: the
// approach is flown to first contact and that state is then moved along the runway by rotating it
// about the body centre. This is an explicit post-contact fixture, not a continuous flight.
function landAndRoll({kind, offset = 0, touchdownAlong = null, rolloutControl = true}) {
  const f = landingFixture({kind, offset, fuelLoad: 0.5}),
    pilot = new LandingPrototype(f, {rolloutControl});
  try {
    let fixture = null;
    if (touchdownAlong !== null) {
      for (let i = 0; i < 200 * 120 && !f.telemetry.contacts; i++) {
        const commands = pilot.update(f, 1 / 120);
        assert.ok(!['failed', 'go-around'].includes(pilot.phase), 'approach reaches the runway');
        f.step(1 / 120, commands);
      }
      assert.ok(f.telemetry.contacts, 'approach touches down');
      const center = f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));
      const along = -runwayApproach(center, f.universalTime).remaining;
      const axis = new T.Vector3(1, 0, 0)
        .applyQuaternion(launchSiteOrientation('runway'))
        .applyQuaternion(surfaceOrientation(f.universalTime));
      const rotation = new T.Quaternion().setFromAxisAngle(axis, (touchdownAlong - along) / PRIMARY.radius);
      const origin = bodyState(PRIMARY, f.universalTime).position;
      const nextCenter = center.clone().sub(origin).applyQuaternion(rotation).add(origin);
      const relative = surfaceRelativeVelocity(center, f.vel, f.universalTime).applyQuaternion(rotation);
      f.q.premultiply(rotation);
      f.holdQ.premultiply(rotation);
      f.pos.copy(nextCenter).sub(f.stats.com.clone().applyQuaternion(f.q));
      f.vel.copy(surfaceVelocity(nextCenter, f.universalTime)).add(relative);
      f.omega.sub(surfaceAngularVelocity()).applyQuaternion(rotation).add(surfaceAngularVelocity());
      f.telemetry.wheelContacts = [];
      pilot.track = null;
      fixture = {along: -runwayApproach(nextCenter, f.universalTime).remaining, speed: relative.length()};
    }
    const initialParts = f.parts.length;
    let touchdown = null,
      worst = null;
    for (let i = 0; i < 200 * 120 && !f.crashed; i++) {
      const commands = pilot.update(f, 1 / 120);
      if (['stopped', 'failed', 'go-around'].includes(pilot.phase)) break;
      f.step(1 / 120, commands);
      if (f.telemetry.contacts) {
        const sample = {time: f.time, impact: f.telemetry.wheelImpactSpeed, brake: f.brake};
        touchdown ??= sample;
        if (!worst || sample.impact < worst.impact) worst = sample;
      }
    }
    return {
      fixture,
      result: pilot.phase,
      crashed: f.crashed,
      initialParts,
      remainingParts: f.parts.length,
      touchdown,
      worst,
      track: pilot.track
    };
  } finally {
    f.dispose();
  }
}
test('landing guidance keeps a normal touchdown gentle and, touching down 1200 m along, brakes at once and stops on the runway', () => {
  for (const kind of ['plane', 'plane-large', 'transport-cargo']) {
    const normal = landAndRoll({kind, offset: 200});
    assert.equal(normal.result, 'stopped', kind);
    assert.equal(normal.crashed, false);
    assert.equal(normal.initialParts, normal.remainingParts);
    assert.ok(normal.worst.impact > -3, kind + ' ' + JSON.stringify(normal.worst));
    assert.ok(
      normal.track.minAlong >= 0 &&
        normal.track.maxAlong < RUNWAY.length &&
        normal.track.maxCross < RUNWAY.width / 2
    );
    // The same late touchdown with the rollout control switched off: brakes held from contact
    // and no pitch damping.
    const baseline = landAndRoll({kind, touchdownAlong: 1200, rolloutControl: false});
    const late = landAndRoll({kind, touchdownAlong: 1200});
    assert.deepEqual(late.fixture, baseline.fixture);
    assert.ok(Math.abs(late.fixture.along - 1200) < 0.01);
    assert.equal(baseline.result, 'stopped', kind);
    assert.equal(late.result, 'stopped', kind);
    assert.equal(late.touchdown.brake, true, 'no braking delay when the runway is short');
    assert.equal(late.crashed, false);
    assert.equal(late.initialParts, late.remainingParts);
    assert.ok(late.track.maxAlong < baseline.track.maxAlong);
    assert.ok(
      late.track.maxAlong < RUNWAY.length &&
        late.track.minAlong > 1190 &&
        late.track.maxCross < RUNWAY.width / 2
    );
    // Immediate braking prioritizes stopping distance; do not claim all impacts > -3.
    assert.ok(late.worst.impact > baseline.worst.impact);
  }
});
