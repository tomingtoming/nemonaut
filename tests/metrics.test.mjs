import test from 'node:test';
import assert from 'node:assert/strict';
import {
  metrics,
  readVisitor,
  readAudience,
  createRecorder,
  createBatcher,
  batchPayload,
  craftTraits,
  craftSignature,
  exampleId,
  TRAIT_NAMES,
  MILESTONES,
  FAILURE_ROWS,
  EVENT_ROWS,
  VISITOR_KEY,
  AUDIENCE_KEY
} from '../dist/metrics.js';
import {preset, PARTS} from '../dist/catalog.js';
import {examples} from '../dist/examples.js';
import {saveCraft, loadCraft} from '../dist/craft-save.js';
import {storageKey} from '../dist/app-id.js';

// The pure parts of the play metrics client. The Worker side is tests/worker-metric.test.mjs.
const memory = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: k => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, String(v)),
    removeItem: k => void data.delete(k)
  };
};
const denied = {
  getItem() {
    throw Error('denied');
  },
  setItem() {
    throw Error('denied');
  },
  removeItem() {
    throw Error('denied');
  }
};
const DAY = 86_400_000,
  T0 = Date.parse('2026-03-01T10:00:00Z');
const recording = () => {
  const rows = [],
    clock = {t: 0};
  return {rows, clock, recorder: createRecorder({now: () => clock.t, emit: (e, f) => rows.push({e, ...f})})};
};
const visitor = {id: 'aaaaaaaaaaaaaaaa', visits: 2, days: 5};

test('under Node the shipper is inert: every hook is a no-op and nothing is touched at import', () => {
  metrics.begin('fresh');
  metrics.frame('centre');
  metrics.edit();
  metrics.example('rocket');
  metrics.launch(preset('rocket'), 'land', false);
  metrics.milestones([{type: 'orbit', orbit: {bodyId: 'planet'}}]);
  metrics.autopilot('ascent');
  metrics.craftFile('export', 3);
  metrics.failure('impact');
});
test('the visitor record uses the app key scheme, counts visits and days, and survives bad storage', () => {
  assert.equal(VISITOR_KEY, storageKey('visitor'));
  assert.equal(VISITOR_KEY, 'nemonaut-visitor');
  assert.equal(AUDIENCE_KEY, 'nemonaut-metrics');
  const store = memory();
  const first = readVisitor(store, T0, () => 'abcdef0123456789');
  assert.deepEqual(first, {id: 'abcdef0123456789', visits: 1, days: 0});
  assert.deepEqual(JSON.parse(store.data.get(VISITOR_KEY)), {
    id: 'abcdef0123456789',
    first: '2026-03-01',
    visits: 1
  });
  const later = readVisitor(store, T0 + 3 * DAY, () => 'other');
  assert.deepEqual(later, {id: 'abcdef0123456789', visits: 2, days: 3});
  // A corrupt or foreign record counts as absent.
  for (const raw of ['{not json', '[]', '{"id":"has spaces and 日本語"}', '{"id":7}'])
    assert.deepEqual(
      readVisitor(memory({[VISITOR_KEY]: raw}), T0, () => 'abcdef0123456789'),
      {id: 'abcdef0123456789', visits: 1, days: 0},
      raw
    );
  // Storage that refuses (private mode) or is absent: visits 0, never a throw.
  assert.equal(readVisitor(denied, T0).visits, 0);
  assert.equal(readVisitor(null, T0).visits, 0);
  assert.match(readVisitor(null, T0).id, /^[a-z0-9]{8,32}$/);
  // A clock set before the stored first day does not give negative days.
  assert.equal(readVisitor(store, T0 - 10 * DAY).days, 0);
});
test('?metrics=off and ?metrics=dev are stored for the browser, ?metrics=public undoes them', () => {
  const store = memory();
  assert.equal(readAudience(store, ''), 'public');
  assert.equal(readAudience(store, '?metrics=off'), 'off');
  assert.equal(readAudience(store, ''), 'off');
  assert.equal(readAudience(store, '?other=1'), 'off');
  assert.equal(readAudience(store, '?metrics=public'), 'public');
  assert.equal(store.data.has(AUDIENCE_KEY), false);
  assert.equal(readAudience(store, '?metrics=DEV'), 'dev');
  assert.equal(readAudience(store, ''), 'dev');
  assert.equal(readAudience(store, '?metrics=nonsense'), 'dev');
  // Without usable storage the switch still holds for this page load.
  assert.equal(readAudience(denied, '?metrics=off'), 'off');
  assert.equal(readAudience(null, '?metrics=dev'), 'dev');
  assert.equal(readAudience(denied, ''), 'public');
});
test('the session row waits for the first frame and carries the time to it', () => {
  const {rows, clock, recorder} = recording();
  recorder.session(visitor, 'example.org');
  assert.deepEqual(rows, []);
  clock.t = 900;
  recorder.frame('centre', 1234.6);
  recorder.frame('centre', 1300);
  assert.deepEqual(rows, [{e: 'session', visits: 2, days: 5, ref: 'example.org', kind: 'ready', ms: 1235}]);
});
test('a tab hidden or closed before any frame is one session row of kind noframe', () => {
  for (const leave of [r => r.visibility(true), r => r.end()]) {
    const {rows, recorder} = recording();
    recorder.session(visitor, '');
    leave(recorder);
    recorder.frame('centre', 5000);
    assert.deepEqual(
      rows.filter(r => r.e === 'session'),
      [{e: 'session', visits: 2, days: 5, ref: '', kind: 'noframe', ms: 0}]
    );
  }
});
test('session-end reports visible seconds per scene with the hidden time taken out, once', () => {
  const {rows, clock, recorder} = recording();
  recorder.session(visitor, '');
  clock.t = 1000;
  recorder.frame('centre', 1000);
  clock.t = 11_000;
  recorder.frame('workshop', 0);
  recorder.count('edit');
  recorder.count('edit');
  clock.t = 31_000;
  recorder.frame('flight', 0);
  recorder.count('launch');
  clock.t = 41_000;
  recorder.visibility(true);
  recorder.visibility(true);
  clock.t = 101_000;
  recorder.visibility(false);
  recorder.visibility(false);
  assert.equal(recorder.visibleSeconds(), 41);
  clock.t = 106_000;
  recorder.frame('centre', 0);
  clock.t = 108_000;
  recorder.end();
  recorder.end();
  recorder.event('example', {example: 'rocket'});
  recorder.failure('impact');
  recorder.frame('flight', 0);
  assert.deepEqual(rows.slice(1), [
    {
      e: 'session-end',
      kind: 'left',
      secs: 48,
      hidden: 60,
      centre: 12,
      workshop: 20,
      flight: 15,
      edits: 2,
      launches: 1,
      failures: 0
    }
  ]);
});
test('a page left while hidden does not count the hidden span as play', () => {
  const {rows, clock, recorder} = recording();
  recorder.session(visitor, '');
  recorder.frame('flight', 10);
  clock.t = 5000;
  recorder.visibility(true);
  clock.t = 65_000;
  recorder.end();
  const end = rows.at(-1);
  assert.deepEqual([end.secs, end.hidden, end.flight], [5, 60, 5]);
});
test('a breakup is a few failure rows; the session-end carries the full count', () => {
  const {rows, recorder} = recording();
  recorder.session(visitor, '');
  recorder.frame('flight', 10);
  for (let i = 0; i < 50; i++) recorder.failure(i % 2 ? 'impact' : 'thermal');
  recorder.end();
  const failures = rows.filter(r => r.e === 'failure');
  assert.equal(failures.length, FAILURE_ROWS);
  assert.deepEqual(failures[0], {e: 'failure', kind: 'thermal'});
  assert.equal(rows.at(-1).failures, 50);
});
test('rows per page load are capped, and the session-end still goes out', () => {
  const {rows, recorder} = recording();
  recorder.session(visitor, '');
  recorder.frame('flight', 10);
  for (let i = 0; i < EVENT_ROWS + 50; i++) recorder.event('autopilot', {kind: 'cruise'});
  recorder.end();
  assert.equal(rows.filter(r => r.e === 'autopilot').length, EVENT_ROWS);
  assert.equal(rows.at(-1).e, 'session-end');
});
test('rows are sent in batches: after the delay, at once when full, and on flush', () => {
  const sent = [],
    timers = [];
  const context = {
    vid: 'aaaaaaaaaaaaaaaa',
    sid: 'bbbbbbbb',
    aud: 'dev',
    build: '708b991',
    device: 'touch',
    ui: 'en',
    lang: 'en-US',
    entry: 'resume'
  };
  const batcher = createBatcher({
    context,
    send: (body, beacon) => sent.push({...JSON.parse(body), beacon}),
    schedule: run => timers.push(run),
    size: 3
  });
  batcher.emit('session', {kind: 'ready', ms: 800});
  batcher.emit('example', {example: 'plane'});
  assert.equal(sent.length, 0);
  assert.equal(timers.length, 1, 'one timer for the events of one moment');
  timers.shift()();
  assert.deepEqual(sent[0], {
    v: 1,
    ...context,
    events: [
      {e: 'session', kind: 'ready', ms: 800},
      {e: 'example', example: 'plane'}
    ],
    beacon: false
  });
  for (let i = 0; i < 3; i++) batcher.emit('autopilot', {kind: 'cruise'});
  assert.equal(sent.length, 2, 'a full batch does not wait');
  assert.equal(sent[1].events.length, 3);
  batcher.emit('session-end', {kind: 'left', secs: 9});
  batcher.flush(true);
  assert.equal(sent[2].beacon, true);
  assert.equal(sent[2].events[0].e, 'session-end');
  batcher.flush(true);
  for (const run of timers) run();
  assert.equal(sent.length, 3, 'an empty queue sends nothing');
  assert.equal(batchPayload(context, []), JSON.stringify({v: 1, ...context, events: []}));
});
test('craft traits come from catalog properties, in a fixed order', () => {
  assert.equal(craftTraits([]), '');
  assert.equal(craftTraits(preset('rocket')), 'wing,rocket');
  const plane = craftTraits(preset('plane')).split(',');
  for (const t of ['wing', 'wheel', 'jet']) assert.ok(plane.includes(t), t);
  assert.ok(!plane.includes('rocket'));
  const boat = craftTraits(preset('boat')).split(',');
  for (const t of ['screw', 'float']) assert.ok(boat.includes(t), t);
  assert.ok(craftTraits(preset('orbital-tug')).split(',').includes('dock'));
  assert.ok(craftTraits(preset('rover')).split(',').includes('drive'));
  // Every catalog part gives only known names, in TRAIT_NAMES order, within the Worker's pattern.
  const all = craftTraits(Object.keys(PARTS).map(type => ({type})));
  assert.deepEqual(all.split(','), [...TRAIT_NAMES]);
  assert.match(all, /^[a-z]+(,[a-z]+){0,23}$/);
  assert.ok(all.length <= 128);
  // The name of a part plays no role: an unknown type has no traits.
  assert.equal(craftTraits([{type: 'wing'}], {}), '');
});
test('an unmodified built-in example is recognised by structure; any change makes it custom', () => {
  const ids = Object.keys(examples);
  assert.ok(ids.length > 30);
  for (const id of ids) {
    assert.match(id, /^[a-z0-9][a-z0-9-]{0,31}$/, id + ' must fit the id pattern of the Worker');
    assert.equal(exampleId(preset(id), examples[id][3]), id);
  }
  // Examples that share one craft are told apart by the start; an unlisted start gives the first.
  assert.equal(exampleId(preset('hopper'), 'moon-orbit'), 'lander');
  assert.equal(exampleId(preset('lander'), 'water'), 'hopper');
  // Part ids are random per copy and do not matter; a save/load round trip keeps the example.
  const rocket = preset('rocket');
  assert.notEqual(rocket[0].id, preset('rocket')[0].id);
  assert.equal(exampleId(loadCraft(saveCraft(rocket, 'ぼくのロケット'))), 'rocket');
  assert.equal(exampleId(rocket.slice(0, -1)), 'custom');
  const moved = structuredClone(rocket);
  moved[1].p[1] += 0.5;
  assert.equal(exampleId(moved), 'custom');
  const restaged = structuredClone(rocket);
  restaged[2].stage += 1;
  assert.equal(exampleId(restaged), 'custom');
  assert.equal(exampleId([]), 'custom');
  assert.equal(craftSignature(rocket), craftSignature(preset('rocket')));
});
test('milestone kinds are history event types', async () => {
  const {appendHistory} = await import('../dist/world-history.js');
  assert.equal(typeof appendHistory, 'function');
  for (const kind of MILESTONES) assert.match(kind, /^[a-z0-9][a-z0-9-]{0,31}$/);
  assert.ok(!MILESTONES.includes('launch'));
});
