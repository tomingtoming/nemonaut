import {saveKind, isSaveKind} from './app-id.js';
import {validateHistory} from './world-history.js';
import {loadFlight, saveFlight, type SavedFlight, type SavedFlightMeta} from './flight-save.js';
import {validUniversalTime} from './universal-time.js';

/** A world vessel always carries the world's universalTime (validateWorld checks it). */
export type WorldVessel = Omit<SavedFlight, 'detached' | 'meta' | 'universalTime'> & {
  vesselId: string;
  universalTime: number;
};
export interface SavedWorld {
  kind: string;
  version: number;
  universalTime: number;
  activeVesselId: string | null;
  vessels: WorldVessel[];
  history: import('./world-history.js').WorldHistoryEvent[];
  flightMeta: SavedFlightMeta;
}
export interface WorldFromFlightOptions {
  universalTime?: number;
  history?: unknown;
}

// Vessel lists this module has itself validated: loaded as a flight tree and written back. The mark is
// private to this module and is held against the array object together with a strict fingerprint of its
// content. A copy (structuredClone, a JSON round trip, a spread of the array) is another object and has no
// mark; an array changed in place no longer matches its fingerprint. Whatever enters from outside
// (storage, import, quick-load) is therefore loaded and checked in full, exactly as before.
const validatedVessels = new WeakMap<readonly WorldVessel[], string>();
/** Thrown inside the fingerprint for content JSON cannot tell apart; such a list is never marked. */
const UNMARKABLE = Symbol('unmarkable');
/** JSON text that distinguishes everything validation distinguishes (JSON alone merges NaN, null and -0). */
function fingerprint(vessels: readonly WorldVessel[]): string | null {
  try {
    return JSON.stringify(vessels, (_key, v: unknown) => {
      if (typeof v === 'number') return Number.isFinite(v) && !Object.is(v, -0) ? v : '\u0000' + String(v);
      if (typeof v === 'string') return v.startsWith('\u0000') ? '\u0000' + v : v;
      if (v === null || typeof v === 'boolean') return v;
      if (typeof v === 'object') {
        const proto: unknown = Object.getPrototypeOf(v);
        if (proto === Object.prototype || proto === Array.prototype || proto === null) return v;
      }
      throw UNMARKABLE;
    });
  } catch (e) {
    if (e === UNMARKABLE) return null;
    throw e;
  }
}
function markValidated(vessels: readonly WorldVessel[], print = fingerprint(vessels)): void {
  if (print !== null) validatedVessels.set(vessels, print);
}
/** The mark's fingerprint if this very list was validated here and has not changed since, else null. */
function validatedPrint(vessels: readonly WorldVessel[]): string | null {
  const print = validatedVessels.get(vessels);
  if (print === undefined) return null;
  if (fingerprint(vessels) === print) return print;
  validatedVessels.delete(vessels);
  return null;
}

// Persistent ownership is a flat world. The flight tree is only an adapter for
// the existing simulation, and must not dictate ownership or vessel identity.
/** saveFlight output names its vessel and clock; a world vessel needs both. */
function isWorldVessel(v: Omit<SavedFlight, 'detached' | 'meta'>): v is WorldVessel {
  return typeof v.vesselId === 'string' && typeof v.universalTime === 'number';
}
function flatten(record: SavedFlight, out: WorldVessel[] = []): WorldVessel[] {
  const {detached, meta, ...vessel} = record;
  if (!isWorldVessel(vessel)) throw Error('世界の機体に機体IDまたは時刻がありません');
  out.push(vessel);
  for (const child of detached ?? []) flatten(child, out);
  return out;
}
function rawFlight(world: SavedWorld, activeId: string | null = world.activeVesselId): SavedFlight | null {
  if (!world.vessels.length) return null;
  const selected = activeId ?? world.vessels[0].vesselId;
  const active = world.vessels.find(v => v.vesselId === selected);
  if (!active) throw Error('選択した機体が世界に存在しません');
  const meta: SavedFlightMeta = {
    ...structuredClone(world.flightMeta ?? {}),
    worldHistory: structuredClone(world.history ?? [])
  };
  if (selected !== world.activeVesselId) {
    meta.name = active.vesselName;
    meta.pilot = null;
  }
  return structuredClone({
    ...active,
    meta,
    detached: world.vessels.filter(v => v !== active).map(v => ({...v, detached: []}))
  });
}
export function worldFromFlight(
  record: SavedFlight | null,
  {universalTime, history = record?.meta?.worldHistory ?? []}: WorldFromFlightOptions = {}
): SavedWorld {
  if (!record)
    return {
      kind: saveKind('world'),
      version: 1,
      universalTime: validUniversalTime(universalTime ?? 0),
      activeVesselId: null,
      vessels: [],
      history: validateHistory(history, universalTime ?? 0),
      flightMeta: {}
    };
  const root = loadFlight(record);
  try {
    if (universalTime !== undefined && root.universalTime !== universalTime)
      throw Error('世界と機体の共通時刻が一致しません');
    const normalized = saveFlight(root, record.meta),
      savedMeta = normalized.meta;
    if (!savedMeta) throw Error('飛行保存の表示情報がありません');
    const {worldHistory, ...flightMeta} = savedMeta,
      vessels = flatten(normalized);
    markValidated(vessels);
    return {
      kind: saveKind('world'),
      version: 1,
      universalTime: root.universalTime,
      activeVesselId: root.vesselId,
      vessels,
      history: validateHistory(history, root.universalTime),
      flightMeta
    };
  } finally {
    root.dispose();
  }
}
export function validateWorld(value: SavedWorld): SavedWorld {
  if (
    !isSaveKind(value?.kind, 'world') ||
    value.version !== 1 ||
    !Array.isArray(value.vessels) ||
    value.vessels.length > 400
  )
    throw Error('世界保存の形式が不正です');
  const time = validUniversalTime(value.universalTime),
    history = validateHistory(value.history, time),
    ids = new Set<string>();
  for (const v of value.vessels) {
    if (
      !v ||
      typeof v.vesselId !== 'string' ||
      !v.vesselId.length ||
      v.vesselId.length > 256 ||
      ids.has(v.vesselId) ||
      Object.hasOwn(v, 'detached') ||
      v.universalTime !== time
    )
      throw Error('世界の機体ID・時刻・所属が不正です');
    ids.add(v.vesselId);
  }
  if (value.activeVesselId !== null && !ids.has(value.activeVesselId))
    throw Error('操縦対象が世界に存在しません');
  if (
    value.flightMeta !== undefined &&
    (value.flightMeta === null || typeof value.flightMeta !== 'object' || Array.isArray(value.flightMeta))
  )
    throw Error('飛行の表示情報が不正です');
  const raw = rawFlight(value);
  if (!raw)
    return {
      ...worldFromFlight(null, {universalTime: time, history}),
      flightMeta: structuredClone(value.flightMeta ?? {})
    };
  // The vessels were loaded and written back by this module and are unchanged: the checks above cover
  // everything else, and the result is what loading them again would write.
  const print = validatedPrint(value.vessels);
  if (print !== null) {
    const vessels = structuredClone(value.vessels),
      flightMeta: SavedFlightMeta = structuredClone(value.flightMeta ?? {});
    // Without an active vessel the first one stood in as the root of the flight tree.
    if (value.activeVesselId === null) {
      flightMeta.name = vessels[0].vesselName;
      flightMeta.pilot = null;
    }
    markValidated(vessels, print);
    return {
      kind: saveKind('world'),
      version: 1,
      universalTime: time,
      activeVesselId: value.activeVesselId,
      vessels,
      history: validateHistory(history, time),
      flightMeta
    };
  }
  // Reuse global part budgets, resources, target/port references and physics
  // validation across the entire world, not independently per vessel.
  const normalized = worldFromFlight(raw, {universalTime: time, history});
  const byId = new Map(normalized.vessels.map(v => [v.vesselId, v]));
  normalized.vessels = value.vessels.map(v => {
    const vessel = byId.get(v.vesselId);
    if (!vessel) throw Error('正規化した世界に機体がありません: ' + v.vesselId);
    return vessel;
  });
  normalized.activeVesselId = value.activeVesselId;
  markValidated(normalized.vessels);
  return normalized;
}
export function flightFromWorld(
  value: SavedWorld,
  {activeVesselId = value.activeVesselId}: {activeVesselId?: string | null} = {}
): SavedFlight | null {
  return rawFlight(validateWorld(value), activeVesselId);
}
