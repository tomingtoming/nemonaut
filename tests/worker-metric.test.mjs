import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';
import {TRAIT_NAMES, MILESTONES, EVENT_ROWS} from '../dist/metrics.js';

// The Worker (worker/*.ts) is bundled by wrangler at deploy and is not part of dist. Here each module
// is bundled in memory the same way and imported, so nothing is written and nothing can be served.
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
async function load(name) {
  const {outputFiles} = await build({
    absWorkingDir: root,
    entryPoints: [path.join('worker', name)],
    bundle: true,
    write: false,
    format: 'esm',
    target: 'es2022',
    logLevel: 'silent'
  });
  return import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64'));
}
const {default: worker} = await load('index.ts');
const {metric, COLUMNS, EVENTS, MAX_BODY_BYTES, MAX_EVENTS} = await load('metric.ts');

const URL_ = 'https://nemonaut.example/metric';
function fakeEnv({play = true, limit} = {}) {
  const points = [],
    keys = [],
    assets = [];
  return {
    points,
    keys,
    assets,
    env: {
      ASSETS: {
        fetch: async request => {
          assets.push(new URL(request.url).pathname);
          return new Response('from assets', {status: 404});
        }
      },
      ...(play ? {PLAY: {writeDataPoint: p => void points.push(p)}} : {}),
      ...(limit === undefined
        ? {}
        : {
            METRIC_RATE: {
              limit: async ({key}) => {
                keys.push(key);
                if (limit === 'throw') throw Error('limiter down');
                return {success: limit};
              }
            }
          })
    }
  };
}
const post = (body, headers = {}) =>
  new Request(URL_, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: {'Content-Type': 'application/json', ...headers}
  });
const batch = (events, extra = {}) => ({
  v: 1,
  vid: 'abcdef0123456789',
  sid: 'a1b2c3d4',
  aud: 'public',
  build: '708b991',
  device: 'desktop',
  ui: 'ja',
  lang: 'ja-JP',
  entry: 'fresh',
  events,
  ...extra
});
const row = point => ({
  ...Object.fromEntries(COLUMNS.blobs.map((c, i) => [c, point.blobs[i]])),
  ...Object.fromEntries(COLUMNS.doubles.map((c, i) => [c, point.doubles[i]]))
});
// Silences the one log line per batch for the duration of a call.
async function quiet(run) {
  const {log, error} = console,
    lines = [];
  console.log = (...a) => lines.push(a.join(' '));
  console.error = (...a) => lines.push(a.join(' '));
  try {
    return {result: await run(), lines};
  } finally {
    console.log = log;
    console.error = error;
  }
}

test('the column order is the documented one', () => {
  assert.deepEqual(COLUMNS.blobs, [
    'event',
    'kind',
    'entry',
    'env',
    'example',
    'traits',
    'body',
    'device',
    'ui',
    'lang',
    'ref',
    'audience',
    'sid',
    'build',
    'host',
    'country'
  ]);
  assert.deepEqual(COLUMNS.doubles, [
    'secs',
    'hidden',
    'centre',
    'workshop',
    'flight',
    'edits',
    'launches',
    'failures',
    'visits',
    'days',
    'ms',
    'parts'
  ]);
  const doc = readFileSync(path.join(root, 'docs', 'metrics.md'), 'utf8');
  COLUMNS.blobs.forEach((c, i) =>
    assert.match(doc, new RegExp('\\| `blob' + (i + 1) + '` \\| ' + c + '\\b'), c)
  );
  COLUMNS.doubles.forEach((c, i) =>
    assert.match(doc, new RegExp('\\| `double' + (i + 1) + '` \\| ' + c + '\\b'), c)
  );
  for (const e of EVENTS) assert.ok(doc.includes('| `' + e + '` |'), e + ' is documented');
});
test('only POST is accepted', async () => {
  const {env, points} = fakeEnv();
  for (const method of ['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS']) {
    const response = await metric(new Request(URL_, {method}), env);
    assert.equal(response.status, 405, method);
    assert.equal(response.headers.get('Allow'), 'POST');
  }
  assert.equal(points.length, 0);
});
test('cross-origin posts, other content types, oversized and malformed bodies are refused', async () => {
  const {env, points} = fakeEnv();
  const status = async request => (await quiet(() => metric(request, env))).result.status;
  assert.equal(await status(post(batch([]), {Origin: 'https://elsewhere.example'})), 403);
  assert.equal(await status(post(batch([]), {'Sec-Fetch-Site': 'cross-site'})), 403);
  assert.equal(await status(post(batch([]), {Origin: 'https://nemonaut.example'})), 204);
  assert.equal(await status(post(batch([]), {'Sec-Fetch-Site': 'same-origin'})), 204);
  assert.equal(await status(post(batch([]), {'Sec-Fetch-Site': 'same-site'})), 403);
  assert.equal(await status(post(batch([]), {'Sec-Fetch-Site': 'none'})), 403);
  // The browser's own statement wins over the Origin comparison (a local run sees a rewritten host).
  assert.equal(
    await status(post(batch([]), {'Sec-Fetch-Site': 'same-origin', Origin: 'http://127.0.0.1:8791'})),
    204
  );
  assert.equal(
    await status(post(batch([]), {'Sec-Fetch-Site': 'cross-site', Origin: 'https://nemonaut.example'})),
    403
  );
  assert.equal(await status(post(batch([]), {'Content-Type': 'text/plain'})), 415);
  assert.equal(await status(new Request(URL_, {method: 'POST', body: '{}'})), 415);
  assert.equal(await status(post(batch([]), {'Content-Type': 'application/json; charset=utf-8'})), 204);
  assert.equal(await status(post('x'.repeat(MAX_BODY_BYTES + 1))), 413);
  assert.equal(await status(post(JSON.stringify(batch([])), {'Content-Length': '999999'})), 413);
  // A body sent without a length is cut off while it is read.
  const stream = new ReadableStream({
    start(controller) {
      for (let i = 0; i < 4; i++) controller.enqueue(new TextEncoder().encode('y'.repeat(4096)));
      controller.close();
    }
  });
  assert.equal(
    await status(
      new Request(URL_, {
        method: 'POST',
        body: stream,
        duplex: 'half',
        headers: {'Content-Type': 'application/json'}
      })
    ),
    413
  );
  for (const body of ['', '{not json', 'null', '[]', '7', '"text"', '{"events":{}}', '{"nope":1}'])
    assert.equal(await status(post(body)), 400, body);
  assert.equal(points.length, 0);
});
test('the rate limit is per address; a failing or missing limiter lets the batch through', async () => {
  const limited = fakeEnv({limit: false});
  const refused = await metric(
    post(batch([{e: 'session'}]), {'CF-Connecting-IP': '203.0.113.9'}),
    limited.env
  );
  assert.equal(refused.status, 429);
  assert.equal(refused.headers.get('Retry-After'), '60');
  assert.deepEqual(limited.keys, ['203.0.113.9']);
  assert.equal(limited.points.length, 0);
  for (const setup of [fakeEnv({limit: true}), fakeEnv({limit: 'throw'}), fakeEnv()]) {
    const {result} = await quiet(() => metric(post(batch([{e: 'session'}])), setup.env));
    assert.equal(result.status, 204);
    assert.equal(setup.points.length, 1);
  }
  // The address is the limiter key only: it is in no stored column.
  const open = fakeEnv({limit: true});
  await quiet(() => metric(post(batch([{e: 'session'}]), {'CF-Connecting-IP': '203.0.113.9'}), open.env));
  assert.ok(!JSON.stringify(open.points).includes('203.0.113.9'));
});
test('without the dataset binding a valid batch is answered 204 and nothing is written', async () => {
  const {env} = fakeEnv({play: false});
  assert.equal((await metric(post(batch([{e: 'session'}])), env)).status, 204);
});
test('one point per event in column order, stamped with the request host and country', async () => {
  const {env, points} = fakeEnv({limit: true});
  const request = post(
    batch(
      [
        {e: 'session', kind: 'ready', ms: 1234, ref: 'news.example.org', visits: 3, days: 12},
        {e: 'example', example: 'plane'},
        {
          e: 'launch',
          kind: 'practice',
          env: 'moon-orbit',
          example: 'custom',
          traits: 'wing,wheel,jet',
          parts: 41
        },
        {e: 'autopilot', kind: 'launch-demo'},
        {e: 'milestone', kind: 'moon-landing', body: 'moon'},
        {e: 'craft-file', kind: 'export', parts: 17},
        {e: 'failure', kind: 'impact'},
        {
          e: 'session-end',
          kind: 'left',
          secs: 600,
          hidden: 30,
          centre: 40,
          workshop: 200,
          flight: 350,
          edits: 25,
          launches: 2,
          failures: 9
        }
      ],
      {aud: 'dev', device: 'touch', ui: 'en', lang: 'en-US', entry: 'resume'}
    )
  );
  Object.defineProperty(request, 'cf', {value: {country: 'JP', city: 'not stored'}});
  const {result, lines} = await quiet(() => metric(request, env));
  assert.equal(result.status, 204);
  assert.equal(await result.text(), '');
  assert.equal(points.length, 8);
  for (const p of points) {
    assert.deepEqual(p.indexes, ['abcdef0123456789']);
    assert.equal(p.blobs.length, COLUMNS.blobs.length);
    assert.equal(p.doubles.length, COLUMNS.doubles.length);
  }
  const shared = {
    entry: 'resume',
    device: 'touch',
    ui: 'en',
    lang: 'en-US',
    audience: 'dev',
    sid: 'a1b2c3d4',
    build: '708b991',
    host: 'nemonaut.example',
    country: 'JP'
  };
  const blank = {
    kind: '',
    env: '',
    example: '',
    traits: '',
    body: '',
    ref: '',
    ...Object.fromEntries(COLUMNS.doubles.map(c => [c, 0]))
  };
  assert.deepEqual(
    points.map(row),
    [
      {event: 'session', kind: 'ready', ms: 1234, ref: 'news.example.org', visits: 3, days: 12},
      {event: 'example', example: 'plane'},
      {
        event: 'launch',
        kind: 'practice',
        env: 'moon-orbit',
        example: 'custom',
        traits: 'wing,wheel,jet',
        parts: 41
      },
      {event: 'autopilot', kind: 'launch-demo'},
      {event: 'milestone', kind: 'moon-landing', body: 'moon'},
      {event: 'craft-file', kind: 'export', parts: 17},
      {event: 'failure', kind: 'impact'},
      {
        event: 'session-end',
        kind: 'left',
        secs: 600,
        hidden: 30,
        centre: 40,
        workshop: 200,
        flight: 350,
        edits: 25,
        launches: 2,
        failures: 9
      }
    ].map(expected => ({...blank, ...shared, ...expected}))
  );
  // One log line per batch, without the visitor id.
  assert.equal(lines.length, 1);
  assert.match(
    lines[0],
    /^\[metric\] \{"n":8,"host":"nemonaut\.example","cc":"JP","aud":"dev","build":"708b991"\}$/
  );
});
test('unknown events are dropped and a batch is cut at the event limit', async () => {
  const {env, points} = fakeEnv();
  const events = [
    {e: 'made-up'},
    {e: ''},
    {},
    null,
    'text',
    7,
    [],
    ...Array.from({length: MAX_EVENTS + 10}, () => ({e: 'autopilot', kind: 'cruise'}))
  ];
  const {result} = await quiet(() => metric(post(batch(events)), env));
  assert.equal(result.status, 204);
  assert.equal(points.length, MAX_EVENTS - 7);
  assert.ok(points.every(p => p.blobs[0] === 'autopilot'));
});
test('a string that is not a built-in identifier is stored as empty, never cut to fit', async () => {
  const {env, points} = fakeEnv();
  const typed = 'ぼくのロケット MK2';
  const {result} = await quiet(() =>
    metric(
      post({
        v: 1,
        vid: typed,
        sid: typed,
        aud: typed,
        build: typed,
        device: typed,
        ui: typed,
        lang: typed,
        entry: typed,
        events: [
          {e: 'launch', kind: typed, env: typed, example: typed, traits: typed, body: typed, ref: typed},
          {
            e: 'launch',
            kind: 'My Craft',
            env: 'a'.repeat(33),
            example: '-rocket',
            traits: 'wing,,jet',
            body: 'moon<script>',
            ref: 'evil.example/path?q=1'
          },
          {e: 'launch', kind: 7, env: {}, example: [], traits: null, body: true, ref: 1.5}
        ]
      }),
      env
    )
  );
  assert.equal(result.status, 204);
  assert.equal(points.length, 3);
  for (const p of points) {
    assert.deepEqual(p.indexes, ['anon']);
    const r = row(p);
    assert.deepEqual(
      [r.kind, r.entry, r.env, r.example, r.traits, r.body, r.device, r.ui, r.lang, r.ref, r.sid, r.build],
      Array(12).fill('')
    );
    assert.equal(r.audience, 'public');
    assert.ok(!JSON.stringify(p).includes('ロケット'));
  }
});
test('numbers are rounded and clamped to their ranges; anything else is 0', async () => {
  const {env, points} = fakeEnv();
  const send = async fields => {
    await quiet(() => metric(post(batch([{e: 'session-end', ...fields}])), env));
    return row(points.at(-1));
  };
  const huge = await send(Object.fromEntries(COLUMNS.doubles.map(c => [c, 1e15])));
  assert.deepEqual(
    COLUMNS.doubles.map(c => huge[c]),
    [2678400, 2678400, 2678400, 2678400, 2678400, 100000, 100000, 100000, 100000, 36500, 3600000, 10000]
  );
  const negative = await send(Object.fromEntries(COLUMNS.doubles.map(c => [c, -5])));
  assert.ok(COLUMNS.doubles.every(c => negative[c] === 0));
  const odd = await send({secs: '12', hidden: null, centre: {}, workshop: [3], flight: true, edits: 2.6});
  assert.deepEqual(
    [odd.secs, odd.hidden, odd.centre, odd.workshop, odd.flight, odd.edits],
    [0, 0, 0, 0, 0, 3]
  );
  // JSON has no NaN or Infinity; an overflowing literal parses to Infinity and is dropped.
  await quiet(() => metric(post('{"events":[{"e":"session-end","secs":1e999}]}'), env));
  assert.equal(row(points.at(-1)).secs, 0);
});
test('a failing dataset write is logged and does not fail the request', async () => {
  const env = {
    ASSETS: {fetch: async () => new Response(null)},
    PLAY: {
      writeDataPoint() {
        throw Error('dataset down');
      }
    }
  };
  const {result, lines} = await quiet(() => metric(post(batch([{e: 'session'}])), env));
  assert.equal(result.status, 204);
  assert.ok(lines.some(l => l.includes('writeDataPoint failed') && l.includes('dataset down')));
  assert.ok(lines.some(l => l.includes('"n":0')));
});
test('what the client sends fits what the Worker accepts', () => {
  assert.match(TRAIT_NAMES.join(','), /^[a-z]+(,[a-z]+){0,23}$/);
  for (const kind of MILESTONES) assert.match(kind, /^[a-z0-9][a-z0-9-]{0,31}$/);
  assert.ok(EVENT_ROWS >= MAX_EVENTS);
});
test('the entry module routes /metric to the handler and everything else to the assets', async () => {
  const {env, points, assets} = fakeEnv();
  const {result} = await quiet(() => worker.fetch(post(batch([{e: 'session'}])), env));
  assert.equal(result.status, 204);
  assert.equal(points.length, 1);
  assert.equal(assets.length, 0);
  assert.equal((await worker.fetch(new Request(URL_), env)).status, 405);
  for (const pathname of ['/nope', '/metric/', '/metrics', '/Metric', '/']) {
    const response = await worker.fetch(new Request('https://nemonaut.example' + pathname), env);
    assert.equal(response.status, 404, pathname);
    assert.equal(await response.text(), 'from assets');
  }
  assert.deepEqual(assets, ['/nope', '/metric/', '/metrics', '/Metric', '/']);
  assert.deepEqual(Object.keys(worker), ['fetch']);
});
test('the Worker is not part of the delivered site', () => {
  for (const name of ['worker', 'metric.js', 'index.js', 'worker.js'])
    assert.equal(existsSync(path.join(root, 'dist', name)), false, name);
  assert.equal(existsSync(path.join(root, 'src', 'worker')), false);
});
