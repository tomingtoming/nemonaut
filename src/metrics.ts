// Anonymous play metrics: what a visit did (which example, which start, how far it got), shipped to
// POST /metric on the same origin (worker/metric.ts → Workers Analytics Engine). docs/metrics.md has
// the events, the column order and the privacy rules.
//
// Privacy: no account, no cookie, nothing the player typed. Only built-in identifiers (example, part
// trait, environment, milestone, autopilot and failure kinds) and numbers leave the page. A random id
// in localStorage tells repeat visits from distinct visitors. `?metrics=off` switches the shipper off
// for this browser, `?metrics=dev` tags its events so queries can leave them out, `?metrics=public`
// undoes either.
//
// The pure parts (visitor record, audience switch, recorder, craft traits, example detection) take
// their clock, storage and sink as arguments. The browser glue is created by begin(); importing this
// module touches nothing, and under Node (no window) every call is a no-op. Nothing here may throw
// into the game or wait on the network.
import {storageKey} from './app-id.js';
import {BUILD_ID} from './build-id.js';
import {PARTS, preset, type Part, type PartCatalog} from './catalog.js';
import {examples} from './examples.js';
import {currentLanguage} from './i18n.js';
import {isTouchDevice} from './touch-device.js';

export const ENDPOINT = '/metric',
  WIRE_VERSION = 1,
  VISITOR_KEY = storageKey('visitor'),
  AUDIENCE_KEY = storageKey('metrics');
const DAY_MS = 86_400_000,
  BATCH_DELAY_MS = 1500,
  BATCH_EVENTS = 20;
/** Failure rows per page load; the rest only add to the session-end count. */
export const FAILURE_ROWS = 3;
/** Rows per page load apart from session and session-end, so a stuck loop cannot spend the write budget. */
export const EVENT_ROWS = 120;

export type Audience = 'public' | 'dev' | 'off';
export type Entry = 'fresh' | 'resume';
export type Scene = 'centre' | 'workshop' | 'flight';
export type Counter = 'edit' | 'launch';
export type EventName =
  'session' | 'session-end' | 'launch' | 'milestone' | 'example' | 'autopilot' | 'craft-file' | 'failure';
export type ActionName = Exclude<EventName, 'session' | 'session-end'>;
export type Fields = Record<string, string | number>;
export interface Visitor {
  id: string;
  /** 1 on the first load ever; 0 when the browser would not store the record. */
  visits: number;
  days: number;
}
/** The part of localStorage used here; a browser may throw on any access. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
export function randomId(): string {
  try {
    const bytes = new Uint8Array(8);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, x => (x + 0x100).toString(16).slice(1)).join('');
  } catch {
    return (Math.random().toString(36) + Math.random().toString(36)).replace(/[^a-z0-9]/g, '').slice(0, 16);
  }
}
const dayStamp = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** Reads the visitor record, counts this visit and writes it back. A corrupt record counts as absent. */
export function readVisitor(
  store: StorageLike | null,
  nowMs: number,
  makeId: () => string = randomId
): Visitor {
  let record: unknown = null;
  try {
    const raw = store?.getItem(VISITOR_KEY);
    if (raw) record = JSON.parse(raw);
  } catch {}
  let id = makeId(),
    first = dayStamp(nowMs),
    visits = 1;
  if (isRecord(record) && typeof record.id === 'string' && /^[a-z0-9]{8,32}$/.test(record.id)) {
    id = record.id;
    if (typeof record.first === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(record.first)) first = record.first;
    visits = (typeof record.visits === 'number' && record.visits > 0 ? Math.floor(record.visits) : 0) + 1;
  }
  let persisted = false;
  try {
    if (store) {
      store.setItem(VISITOR_KEY, JSON.stringify({id, first, visits}));
      persisted = true;
    }
  } catch {}
  const days = Math.floor((nowMs - Date.parse(first + 'T00:00:00Z')) / DAY_MS);
  return {id, visits: persisted ? visits : 0, days: Number.isFinite(days) && days > 0 ? days : 0};
}
/** `?metrics=off|dev` is stored for this browser; `?metrics=public` clears it. */
export function readAudience(store: StorageLike | null, search: string): Audience {
  let wanted: Audience | null = null;
  try {
    const value = (new URLSearchParams(search).get('metrics') ?? '').toLowerCase();
    if (value === 'off' || value === 'dev' || value === 'public') wanted = value;
  } catch {}
  try {
    if (!store) throw Error('no storage');
    if (wanted === 'public') store.removeItem(AUDIENCE_KEY);
    else if (wanted) store.setItem(AUDIENCE_KEY, wanted);
    const held = store.getItem(AUDIENCE_KEY);
    if (held === 'off' || held === 'dev') return held;
  } catch {
    if (wanted) return wanted;
  }
  return 'public';
}

// Craft traits: what the craft can do, read from catalog properties (never from names).
const TRAITS: readonly (readonly [string, (d: PartCatalog[string]) => boolean])[] = [
  ['wing', d => !!d.wing],
  ['wheel', d => !!d.wheel],
  ['drive', d => !!d.poweredWheel],
  ['screw', d => !!d.screwBlades],
  ['rocket', d => !!d.thrust && d.thrustMedium === 'independent'],
  ['jet', d => !!d.thrust && d.thrustMedium === 'air'],
  ['dock', d => !!d.docking],
  ['chute', d => !!d.parachute],
  ['rcs', d => !!d.rcsThrust],
  ['leg', d => !!d.landingLeg],
  ['shield', d => !!d.heatShield],
  ['solar', d => !!d.solarPower],
  ['float', d => !!d.volume],
  ['ballast', d => !!d.ballast],
  ['cargo', d => !!d.cargoBay],
  ['sep', d => !!d.decoupler]
];
export const TRAIT_NAMES: readonly string[] = TRAITS.map(([name]) => name);
/** Comma-separated trait names in TRAIT_NAMES order, e.g. `wing,wheel,jet`. */
export function craftTraits(parts: readonly Pick<Part, 'type'>[], catalog: PartCatalog = PARTS): string {
  const definitions = [...new Set(parts.map(p => p.type))].flatMap(type => catalog[type] ?? []);
  return TRAITS.filter(([, has]) => definitions.some(has))
    .map(([name]) => name)
    .join(',');
}
/** Structure of a craft without its random part ids: type, pose, parent index, stage and switches. */
export function craftSignature(parts: readonly Part[]): string {
  const index = new Map(parts.map((p, i) => [p.id, i]));
  const round = (v: readonly number[]) => v.map(x => Math.round(x * 1000) / 1000 || 0).join(' ');
  return parts
    .map(p =>
      [
        p.type,
        round(p.p),
        round(p.r),
        p.parent === null ? -1 : (index.get(p.parent) ?? -2),
        p.stage,
        [p.reactionEnabled, p.steeringEnabled, p.fuelEnabled, p.gimbalEnabled, p.driveEnabled]
          .map(v => (v === undefined ? '-' : v ? '1' : '0'))
          .join('')
      ].join('|')
    )
    .join('\n');
}
let exampleSignatures: Map<string, string[]> | null = null;
/**
 * The id of the built-in example these parts are an unmodified copy of, else `custom`. A few examples
 * share one craft and differ in where it starts; among those the start environment decides.
 */
export function exampleId(parts: readonly Part[], environment = ''): string {
  if (!exampleSignatures) {
    exampleSignatures = new Map();
    for (const id of Object.keys(examples)) {
      const signature = craftSignature(preset(id));
      exampleSignatures.set(signature, [...(exampleSignatures.get(signature) ?? []), id]);
    }
  }
  const table: Record<string, readonly string[]> = examples,
    ids = exampleSignatures.get(craftSignature(parts)) ?? [];
  return ids.find(id => table[id][3] === environment) ?? ids[0] ?? 'custom';
}
/** History event types reported as milestones (launch has its own event; flight phases and scrapping are not achievements). */
export const MILESTONES: readonly string[] = [
  'orbit',
  'moon-arrival',
  'moon-landing',
  'delivery',
  'survey',
  'precision-landing',
  'recover'
];
export interface MilestoneEvent {
  type: string;
  bodyId?: string;
  orbit?: {bodyId: string};
}

export interface Recorder {
  /** The page knows how it was entered. The row waits for the first frame, the tab hiding or the end. */
  session(visitor: Visitor, referrerHost: string): void;
  /** A frame was drawn in `scene`, `ms` after navigation start. The first call writes the session row. */
  frame(scene: Scene, ms: number): void;
  event(name: ActionName, fields?: Fields): void;
  count(counter: Counter): void;
  /** A part broke; only the first FAILURE_ROWS write a row. */
  failure(cause: string): void;
  /** Document visibility changed; repeating the same state changes nothing. */
  visibility(hidden: boolean): void;
  /** Closes the session once; later calls of any method are ignored. */
  end(): void;
  /** Seconds the tab has been visible so far. */
  visibleSeconds(): number;
}
/**
 * Turns one page load into rows. Durations count the time the tab was visible: a hidden tab draws no
 * frames, and a parked tab would otherwise report hours. The hidden time is reported next to it.
 */
export function createRecorder({
  now,
  emit
}: {
  now: () => number;
  emit: (name: EventName, fields: Fields) => void;
}): Recorder {
  const start = now(),
    counters: Record<Counter, number> = {edit: 0, launch: 0},
    sceneMs: Record<Scene, number> = {centre: 0, workshop: 0, flight: 0};
  let hiddenSince: number | null = null,
    hiddenMs = 0,
    closed = false,
    pending: Fields | null = null,
    scene: Scene | null = null,
    sceneSince = 0,
    failures = 0,
    rows = 0;
  const hiddenNow = () => hiddenMs + (hiddenSince === null ? 0 : Math.max(0, now() - hiddenSince)),
    visibleMs = () => Math.max(0, now() - start - hiddenNow()),
    seconds = (ms: number) => Math.max(0, Math.round(ms / 1000));
  const flushSession = (kind: 'ready' | 'noframe', ms: number) => {
    if (!pending) return;
    const fields = pending;
    pending = null;
    emit('session', {...fields, kind, ms});
  };
  const enter = (next: Scene | null) => {
    const t = visibleMs();
    if (scene) sceneMs[scene] += Math.max(0, t - sceneSince);
    scene = next;
    sceneSince = t;
  };
  const row = (name: ActionName, fields: Fields) => {
    if (closed || rows >= EVENT_ROWS) return;
    rows++;
    emit(name, fields);
  };
  return {
    session(visitor, referrerHost) {
      if (closed || pending) return;
      pending = {visits: visitor.visits, days: visitor.days, ref: referrerHost.slice(0, 64)};
    },
    frame(next, ms) {
      if (closed) return;
      flushSession('ready', Math.max(0, Math.round(ms)));
      if (next !== scene) enter(next);
    },
    event: (name, fields = {}) => row(name, fields),
    count(counter) {
      if (!closed) counters[counter]++;
    },
    failure(cause) {
      if (closed) return;
      failures++;
      if (failures <= FAILURE_ROWS) row('failure', {kind: cause});
    },
    visibility(hidden) {
      if (closed) return;
      if (hidden) {
        if (hiddenSince === null) hiddenSince = now();
        // Mobile browsers discard background tabs without pagehide: this is the last safe moment.
        flushSession('noframe', 0);
      } else if (hiddenSince !== null) {
        hiddenMs += Math.max(0, now() - hiddenSince);
        hiddenSince = null;
      }
    },
    end() {
      if (closed) return;
      flushSession('noframe', 0);
      enter(null);
      const secs = seconds(visibleMs());
      closed = true;
      emit('session-end', {
        kind: 'left',
        secs,
        hidden: seconds(hiddenNow()),
        centre: seconds(sceneMs.centre),
        workshop: seconds(sceneMs.workshop),
        flight: seconds(sceneMs.flight),
        edits: counters.edit,
        launches: counters.launch,
        failures
      });
    },
    visibleSeconds: () => seconds(visibleMs())
  };
}
/** What every batch carries next to its events. */
export interface BatchContext {
  vid: string;
  sid: string;
  aud: Exclude<Audience, 'off'>;
  build: string;
  device: 'desktop' | 'touch';
  ui: string;
  lang: string;
  entry: Entry;
}
export function batchPayload(context: BatchContext, events: readonly Fields[]): string {
  return JSON.stringify({v: WIRE_VERSION, ...context, events});
}
/**
 * Collects rows and hands them to `send` as one JSON body: after `delay` ms, at once when the batch is
 * full, or when flush is called (page hidden or leaving, where `beacon` asks for sendBeacon).
 */
export function createBatcher({
  context,
  send,
  schedule,
  delay = BATCH_DELAY_MS,
  size = BATCH_EVENTS
}: {
  context: BatchContext;
  send: (body: string, beacon: boolean) => void;
  schedule: (run: () => void, ms: number) => void;
  delay?: number;
  size?: number;
}): {emit(name: EventName, fields: Fields): void; flush(beacon: boolean): void} {
  const queue: Fields[] = [];
  let waiting = false;
  const flush = (beacon: boolean) => {
    if (queue.length) send(batchPayload(context, queue.splice(0, queue.length)), beacon);
  };
  return {
    emit(name, fields) {
      queue.push({e: name, ...fields});
      if (queue.length >= size) flush(false);
      else if (!waiting) {
        waiting = true;
        schedule(() => {
          waiting = false;
          flush(false);
        }, delay);
      }
    },
    flush
  };
}

// ---- browser glue ----
export interface Metrics {
  /** Boot knows whether a stored game was restored. Starts recording; before this every call is ignored. */
  begin(entry: Entry): void;
  /** Called every drawn frame with the scene on screen. */
  frame(scene: Scene): void;
  /** The workshop design changed (one undo checkpoint). */
  edit(): void;
  example(id: string): void;
  launch(parts: readonly Part[], environment: string, practice: boolean): void;
  milestones(events: readonly MilestoneEvent[]): void;
  autopilot(kind: string): void;
  craftFile(direction: 'export' | 'import', parts: number): void;
  failure(cause: string): void;
}
/** Wraps a hook so that a fault in the counter never reaches the game. */
const guarded =
  <A extends unknown[]>(run: (...args: A) => void) =>
  (...args: A): void => {
    try {
      run(...args);
    } catch {}
  };
function send(body: string, beacon: boolean): void {
  try {
    if (
      beacon &&
      typeof navigator.sendBeacon === 'function' &&
      navigator.sendBeacon(ENDPOINT, new Blob([body], {type: 'application/json'}))
    )
      return;
    if (typeof fetch !== 'function') return;
    fetch(ENDPOINT, {
      method: 'POST',
      body,
      keepalive: true,
      headers: {'Content-Type': 'application/json'}
    }).catch(() => {});
  } catch {}
}
function startRecording(entry: Entry): Recorder | null {
  let store: Storage | null = null;
  try {
    store = window.localStorage;
  } catch {}
  const audience = readAudience(store, location.search);
  if (audience === 'off') return null;
  const visitor = readVisitor(store, Date.now());
  let referrerHost = '';
  try {
    const host = document.referrer ? new URL(document.referrer).hostname : '';
    if (host !== location.hostname) referrerHost = host;
  } catch {}
  const batcher = createBatcher({
    context: {
      vid: visitor.id,
      sid: randomId().slice(0, 8),
      aud: audience,
      build: BUILD_ID,
      device: isTouchDevice() ? 'touch' : 'desktop',
      ui: currentLanguage(store),
      lang: String(navigator.language || '').slice(0, 16),
      entry
    },
    send,
    schedule: (run, ms) => void setTimeout(run, ms)
  });
  const recorder = createRecorder({now: Date.now, emit: batcher.emit});
  if (document.hidden) recorder.visibility(true);
  recorder.session(visitor, referrerHost);
  document.addEventListener(
    'visibilitychange',
    guarded(() => {
      recorder.visibility(document.hidden);
      // A hidden tab may never run its timer again; what is queued goes out now.
      if (document.hidden) batcher.flush(true);
    })
  );
  // pagehide is the last event a page reliably gets (mobile browsers skip unload).
  window.addEventListener(
    'pagehide',
    guarded(() => {
      recorder.end();
      batcher.flush(true);
    })
  );
  return recorder;
}
function browserMetrics(): Metrics {
  let recorder: Recorder | null = null,
    begun = false;
  return {
    begin: guarded(entry => {
      if (begun) return;
      begun = true;
      recorder = startRecording(entry);
    }),
    frame(scene) {
      // Every frame: nothing but two comparisons once the session row is out.
      try {
        recorder?.frame(scene, performance.now());
      } catch {}
    },
    edit: guarded(() => recorder?.count('edit')),
    example: guarded(id => recorder?.event('example', {example: id})),
    launch: guarded((parts, environment, practice) => {
      if (!recorder) return;
      recorder.count('launch');
      recorder.event('launch', {
        kind: practice ? 'practice' : 'world',
        env: environment,
        example: exampleId(parts, environment),
        traits: craftTraits(parts),
        parts: parts.length
      });
    }),
    milestones: guarded(events => {
      for (const e of events)
        if (MILESTONES.includes(e.type))
          recorder?.event('milestone', {kind: e.type, body: e.bodyId ?? e.orbit?.bodyId ?? ''});
    }),
    autopilot: guarded(kind => recorder?.event('autopilot', {kind})),
    craftFile: guarded((direction, parts) => recorder?.event('craft-file', {kind: direction, parts})),
    failure: guarded(cause => recorder?.failure(cause))
  };
}
const nothing = () => {};
const inert: Metrics = {
  begin: nothing,
  frame: nothing,
  edit: nothing,
  example: nothing,
  launch: nothing,
  milestones: nothing,
  autopilot: nothing,
  craftFile: nothing,
  failure: nothing
};
export const metrics: Metrics =
  typeof window === 'undefined' || typeof document === 'undefined' ? inert : browserMetrics();
