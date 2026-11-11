// POST /metric (sent by src/metrics.ts) → one Workers Analytics Engine data point per event.
// docs/metrics.md has the events, the column order, the privacy rules and the SQL to read it.
// Kept apart from index.ts because the runtime rejects extra exports on the entry module and the
// tests read COLUMNS and metric from here.
//
// Nothing from the request is stored as it came. Every string must match the pattern of the built-in
// identifiers it stands for or it is dropped (not truncated), every number is clamped to its range,
// and the client address is used only as the rate-limit key.

/** The parts of the Workers runtime used here, typed locally so the project needs no extra type package. */
interface AnalyticsEngineDataset {
  writeDataPoint(point: {indexes?: string[]; blobs?: string[]; doubles?: number[]}): void;
}
interface RateLimiter {
  limit(options: {key: string}): Promise<{success: boolean}>;
}
export interface Env {
  ASSETS: {fetch(request: Request): Promise<Response>};
  PLAY?: AnalyticsEngineDataset;
  METRIC_RATE?: RateLimiter;
}

/** Column layout of the `nemonaut_play` dataset. The SQL in docs/metrics.md assumes this order; only append. */
export const COLUMNS = {
  blobs: [
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
  ],
  doubles: [
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
  ]
} as const;
export const EVENTS: readonly string[] = [
  'session',
  'session-end',
  'launch',
  'milestone',
  'example',
  'autopilot',
  'craft-file',
  'failure'
];
export const MAX_BODY_BYTES = 8192,
  MAX_EVENTS = 20;

const ID = /^[a-z0-9][a-z0-9-]{0,31}$/,
  TRAITS = /^[a-z]+(,[a-z]+){0,23}$/,
  LANGUAGE = /^[A-Za-z0-9-]{1,16}$/,
  HOST = /^[a-z0-9]([a-z0-9.-]{0,62}[a-z0-9])?$/,
  TOKEN = /^[a-z0-9]{1,32}$/;
const MONTH_SECONDS = 2_678_400;
/** Upper bounds of the numeric columns, in COLUMNS.doubles order. */
const LIMITS: Record<(typeof COLUMNS.doubles)[number], number> = {
  secs: MONTH_SECONDS,
  hidden: MONTH_SECONDS,
  centre: MONTH_SECONDS,
  workshop: MONTH_SECONDS,
  flight: MONTH_SECONDS,
  edits: 100_000,
  launches: 100_000,
  failures: 100_000,
  visits: 100_000,
  days: 36_500,
  ms: 3_600_000,
  parts: 10_000
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
/** The string when it matches, else empty: a value that does not look like a built-in id is not stored. */
const text = (v: unknown, pattern: RegExp, max: number): string =>
  typeof v === 'string' && v.length <= max && pattern.test(v) ? v : '';
const oneOf = (v: unknown, allowed: readonly string[]): string =>
  typeof v === 'string' && allowed.includes(v) ? v : '';
const amount = (v: unknown, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.round(v))) : 0;
const empty = (status: number, headers?: Record<string, string>) => new Response(null, {status, headers});

/** The body as text, or null once it is longer than `max` bytes (the rest is not read). */
async function readBody(request: Request, max: number): Promise<string | null> {
  if (Number(request.headers.get('Content-Length') ?? 0) > max) return null;
  const reader = request.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let size = 0,
    out = '';
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    out += decoder.decode(value, {stream: true});
  }
  return out + decoder.decode();
}
function country(request: Request): string {
  const cf: unknown = Reflect.get(request, 'cf');
  return isRecord(cf) ? text(cf.country, /^[A-Z0-9]{2}$/, 2) : '';
}

// Guards, in order: POST only; same origin when the browser says where the request comes from; JSON content type; per-address
// rate limit (a missing binding lets the request through, so an incomplete configuration does not
// switch the counter off); body size; shape. Without the dataset binding the answer is still 204, so
// a local run without Analytics Engine does not look like a failure to the page.
export async function metric(request: Request, env: Env): Promise<Response> {
  try {
    if (request.method !== 'POST') return new Response('POST only', {status: 405, headers: {Allow: 'POST'}});
    // Sec-Fetch-Site is set by the browser and cannot be forged by a page; where it is missing (older
    // browsers, non-browser clients) the Origin header, when present, has to name this origin.
    const url = new URL(request.url),
      site = request.headers.get('Sec-Fetch-Site'),
      origin = request.headers.get('Origin');
    if (site ? site !== 'same-origin' : !!origin && origin !== url.origin) return empty(403);
    if (!/^application\/json\b/i.test(request.headers.get('Content-Type') ?? '')) return empty(415);
    if (env.METRIC_RATE) {
      let allowed = true;
      try {
        allowed = (await env.METRIC_RATE.limit({key: request.headers.get('CF-Connecting-IP') || 'unknown'}))
          .success;
      } catch {}
      if (!allowed) return empty(429, {'Retry-After': '60'});
    }
    const body = await readBody(request, MAX_BODY_BYTES);
    if (body === null) return empty(413);
    let batch: unknown = null;
    try {
      batch = JSON.parse(body);
    } catch {}
    if (!isRecord(batch) || !Array.isArray(batch.events)) return empty(400);
    if (!env.PLAY) return empty(204);

    const visitor = text(batch.vid, TOKEN, 32) || 'anon',
      audience = batch.aud === 'dev' ? 'dev' : 'public',
      build = text(batch.build, TOKEN, 16),
      host = url.hostname,
      cc = country(request);
    const shared = {
      entry: oneOf(batch.entry, ['fresh', 'resume']),
      device: oneOf(batch.device, ['desktop', 'touch']),
      ui: oneOf(batch.ui, ['ja', 'en']),
      lang: text(batch.lang, LANGUAGE, 16),
      sid: text(batch.sid, TOKEN, 16)
    };
    let written = 0;
    const events: unknown[] = batch.events;
    for (const event of events.slice(0, MAX_EVENTS)) {
      if (!isRecord(event)) continue;
      const name = oneOf(event.e, EVENTS);
      if (!name) continue;
      try {
        env.PLAY.writeDataPoint({
          indexes: [visitor],
          blobs: [
            name,
            text(event.kind, ID, 32),
            shared.entry,
            text(event.env, ID, 32),
            text(event.example, ID, 32),
            text(event.traits, TRAITS, 128),
            text(event.body, ID, 32),
            shared.device,
            shared.ui,
            shared.lang,
            text(event.ref, HOST, 64),
            audience,
            shared.sid,
            build,
            host,
            cc
          ],
          doubles: COLUMNS.doubles.map(column => amount(event[column], LIMITS[column]))
        });
        written++;
      } catch (error) {
        // A dataset that stopped receiving reads exactly like nobody visiting: say so in the logs.
        console.error(
          '[metric] writeDataPoint failed:',
          error instanceof Error ? error.message : String(error)
        );
      }
    }
    // One line per batch: the way to tell a live pipeline from a dead one without a query.
    console.log('[metric]', JSON.stringify({n: written, host, cc, aud: audience, build}));
    return empty(204);
  } catch (error) {
    console.error('[metric] failed:', error instanceof Error ? error.message : String(error));
    return empty(400);
  }
}
