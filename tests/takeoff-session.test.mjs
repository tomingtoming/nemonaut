import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {TakeoffSession} from '../dist/takeoff-session.js';
import {previewTakeoff} from '../dist/takeoff-preview.js';
const target = {speed: 90, altitude: 600, heading: 110, mode: 'altitude', vertical: 0};
function setup() {
  const f = new Flight(preset('plane-large'), 'runway', 161700);
  f.stageNext();
  f.brake = true;
  for (let i = 0; i < 120; i++) f.step(1 / 120, {});
  return f;
}
const good = {
  status: 'airborne',
  lastGround: {along: 1245, cross: 0, time: 20},
  wheelTrack: {minAlong: 100, maxAlong: 1250, maxCross: 5, samples: 100}
};

test('full-fuel small jet can lift off yet lacks the required runway reserve', async () => {
  const f = new Flight(preset('plane'), 'runway', 674.2);
  f.stageNext();
  f.brake = true;
  for (let i = 0; i < 120; i++) f.step(1 / 120, {});
  const s = new TakeoffSession({
    cancel() {},
    async request(f, p) {
      return previewTakeoff(f, p, {seconds: 40});
    }
  });
  try {
    const result = await s.prepare(f, {...target, heading: 90});
    assert.equal(result.status, 'airborne');
    assert.equal(result.accepted, false);
    assert.ok(result.wheelTrack.maxAlong > 1525 && result.wheelTrack.maxAlong < 1600);
    assert.throws(() => s.start(f, {...target, heading: 90}), /再予測/);
  } finally {
    s.cancel();
    f.dispose();
  }
});
test('prepared departure uses isolated forecast and starts only explicitly with matching targets', async () => {
  const f = setup(),
    s = new TakeoffSession({
      cancel() {},
      async request(f, p) {
        return previewTakeoff(f, p, {seconds: 40});
      }
    });
  try {
    const before = f.time,
      r = await s.prepare(f, target);
    assert.equal(r.accepted, true);
    assert.equal(f.time, before);
    assert.equal(f.throttle, 0);
    assert.equal(f.brake, true);
    const p = s.start(f, target);
    assert.equal(p.target.heading, 110);
    assert.equal(p.phase, 'roll');
    assert.throws(() => s.start(f, target), /再予測/);
  } finally {
    s.cancel();
    f.dispose();
  }
});
test('configuration, pose, time and target changes invalidate a prepared start', async () => {
  for (const change of [
    f => f.fuel.set(f.fuel.keys().next().value, 0),
    f => (f.parts[0].controlEnabled = false),
    f => (f.pos.x += 1),
    f => (f.universalTime += 6),
    f => (f.trim = 0.1),
    f => (f.brake = false)
  ]) {
    const f = setup(),
      s = new TakeoffSession({
        cancel() {},
        async request() {
          return good;
        }
      });
    try {
      await s.prepare(f, target);
      change(f);
      assert.throws(() => s.start(f, target), /再予測/);
      assert.equal(f.throttle, 0);
    } finally {
      s.cancel();
      f.dispose();
    }
  }
  const f = setup(),
    s = new TakeoffSession({
      cancel() {},
      async request() {
        return good;
      }
    });
  try {
    await s.prepare(f, target);
    assert.throws(() => s.start(f, {...target, altitude: 700}), /再予測/);
  } finally {
    s.cancel();
    f.dispose();
  }
});
test('cancelled preparation and runway overflow never grant start permission', async () => {
  const f = setup();
  let complete;
  const s = new TakeoffSession({
    cancel() {},
    request() {
      return new Promise(resolve => (complete = resolve));
    }
  });
  try {
    const work = s.prepare(f, target);
    s.cancel();
    complete(good);
    assert.equal((await work).status, 'cancelled');
    assert.equal(s.state, 'idle');
    const other = s.prepare(f, target);
    complete({...good, wheelTrack: {...good.wheelTrack, maxAlong: 1858}});
    assert.equal((await other).accepted, false);
    assert.equal(s.state, 'rejected');
    assert.throws(() => s.start(f, target));
  } finally {
    s.cancel();
    f.dispose();
  }
});
test('ready state expires before the UI offers a stale start', async () => {
  const f = setup(),
    s = new TakeoffSession({
      cancel() {},
      async request() {
        return good;
      }
    });
  try {
    await s.prepare(f, target);
    assert.equal(s.readyFor(f, target), true);
    f.universalTime += 6;
    assert.equal(s.readyFor(f, target), false);
    assert.equal(s.state, 'idle');
    assert.equal(f.throttle, 0);
    assert.equal(f.brake, true);
  } finally {
    s.cancel();
    f.dispose();
  }
});
test('COM inside pavement does not excuse wheel excursions or missing track evidence', async () => {
  const f = setup();
  try {
    for (const wheelTrack of [
      null,
      {...good.wheelTrack, maxCross: 9.1},
      {...good.wheelTrack, minAlong: -0.1},
      {...good.wheelTrack, maxAlong: 1526},
      {...good.wheelTrack, maxCross: NaN}
    ]) {
      const s = new TakeoffSession({
        cancel() {},
        async request() {
          return {...good, wheelTrack};
        }
      });
      assert.equal((await s.prepare(f, target)).accepted, false);
      assert.throws(() => s.start(f, target));
    }
  } finally {
    f.dispose();
  }
});
test('a late rejection from a cancelled worker cannot overwrite the newer session', async () => {
  const f = setup();
  let rejectOld;
  const client = {
    cancel() {},
    request() {
      return new Promise((resolve, reject) => (rejectOld = reject));
    }
  };
  const s = new TakeoffSession(client);
  try {
    const old = s.prepare(f, target);
    s.cancel();
    client.request = async () => good;
    await s.prepare(f, target);
    rejectOld(Error('old worker failed'));
    assert.equal((await old).status, 'cancelled');
    assert.equal(s.state, 'ready');
    assert.equal(s.readyFor(f, target), true);
  } finally {
    s.cancel();
    f.dispose();
  }
});
