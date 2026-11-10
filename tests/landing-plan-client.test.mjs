import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {landingFixture} from '../tools/landing-profile.mjs';
import {LandingPlanClient, landingPlanContext, landingPlanCurrent} from '../dist/landing-plan-client.js';
import {LandingPrototype} from '../dist/landing-prototype.js';
const good = f => {
  const c = landingPlanContext(f);
  return {
    status: 'ready',
    plan: {
      speed: 80,
      alpha: 6,
      pitchCommand: -0.5,
      throttle: 0.5,
      density: c.density,
      gravity: 9.8,
      mass: c.mass,
      minimumSample: 76
    }
  };
};
const fake = () => ({
  postMessage(data) {
    this.sent = data;
  },
  terminate() {
    this.closed = true;
  }
});
test('readiness handshake, supersession, manual cancel and late errors preserve the current request', async () => {
  const f = landingFixture(),
    workers = [],
    client = new LandingPlanClient(() => {
      const w = fake();
      workers.push(w);
      return w;
    });
  try {
    const first = client.request(f);
    assert.equal(workers[0].sent, undefined);
    workers[0].onmessage({data: {type: 'ready'}});
    const second = client.request(f);
    assert.equal((await first).status, 'cancelled');
    assert.ok(workers[0].closed);
    workers[1].onmessage({data: {type: 'ready'}});
    workers[0].onerror();
    workers[0].onmessage({data: {...workers[0].sent, result: good(f)}});
    assert.equal(client.pending.worker, workers[1]);
    workers[1].onmessage({data: {...workers[1].sent, id: 999, result: good(f)}});
    assert.ok(client.pending);
    workers[1].onmessage({data: {...workers[1].sent, result: good(f)}});
    assert.equal((await second).status, 'ready');
    const third = client.request(f);
    client.cancel();
    assert.equal((await third).status, 'cancelled');
    assert.ok(workers[2].closed);
  } finally {
    client.cancel();
    f.dispose();
  }
});
test('configuration, rewind, age, mass and density changes invalidate a plan', () => {
  const f = landingFixture();
  try {
    const c = landingPlanContext(f);
    assert.ok(landingPlanCurrent(f, c));
    f.universalTime -= 1;
    assert.equal(landingPlanCurrent(f, c), false);
    f.universalTime = c.epoch + 31;
    assert.equal(landingPlanCurrent(f, c), false);
    f.universalTime = c.epoch;
    f.stats.mass *= 1.02;
    assert.equal(landingPlanCurrent(f, c), false);
    f.stats.mass = c.mass;
    f.parts[0].controlEnabled = false;
    assert.equal(landingPlanCurrent(f, c), false);
    delete f.parts[0].controlEnabled;
    f.pos.multiplyScalar(1.01);
    assert.equal(landingPlanCurrent(f, c), false);
  } finally {
    f.dispose();
  }
});
test('invalid, stale, failed and timed-out replies release the worker', async () => {
  const f = landingFixture();
  let worker;
  const client = new LandingPlanClient(() => (worker = fake()), {timeoutMs: 20});
  try {
    let p = client.request(f);
    worker.onmessage({data: {type: 'ready'}});
    worker.onmessage({data: {...worker.sent, result: {status: 'ready', plan: {speed: NaN}}}});
    await assert.rejects(p, /Invalid/);
    assert.ok(worker.closed);
    p = client.request(f);
    worker.onmessage({data: {type: 'ready'}});
    const mismatch = good(f);
    mismatch.plan.mass *= 2;
    worker.onmessage({data: {...worker.sent, result: mismatch}});
    await assert.rejects(p, /Invalid/);
    p = client.request(f);
    worker.onmessage({data: {type: 'ready'}});
    f.parts[0].controlEnabled = false;
    worker.onmessage({data: {...worker.sent, result: good(f)}});
    assert.equal((await p).status, 'stale');
    delete f.parts[0].controlEnabled;
    p = client.request(f);
    worker.onerror();
    await assert.rejects(p, /worker failed/);
    assert.ok(worker.closed);
    p = client.request(f);
    await assert.rejects(p, /timed out/);
    assert.ok(worker.closed);
  } finally {
    client.cancel();
    f.dispose();
  }
});
test('real bundled worker plans while live flight advances, then hands off without recomputing', async () => {
  const f = landingFixture({kind: 'transport-cargo'});
  let ticks = 0;
  const client = new LandingPlanClient(() => {
    const w = new Worker(new URL('./fixtures/landing-worker.mjs', import.meta.url));
    const adapter = {postMessage: data => w.postMessage(data), terminate: () => w.terminate()};
    w.on('message', data => adapter.onmessage({data}));
    w.on('error', () => adapter.onerror());
    return adapter;
  });
  const timer = setInterval(() => {
    f.step(1 / 120, {});
    ticks++;
  }, 10);
  try {
    const result = await client.request(f);
    clearInterval(timer);
    assert.equal(result.status, 'ready');
    assert.ok(ticks > 2 && f.time > 0);
    const pilot = new LandingPrototype(f, {preparedPlan: result.plan, preparedContext: result.context});
    assert.deepEqual(pilot.trimPlan, result.plan);
    assert.notEqual(pilot.trimPlan, result.plan);
    f.parts[0].controlEnabled = false;
    assert.throws(
      () => new LandingPrototype(f, {preparedPlan: result.plan, preparedContext: result.context}),
      /no longer applies/
    );
  } finally {
    clearInterval(timer);
    client.cancel();
    f.dispose();
  }
});
