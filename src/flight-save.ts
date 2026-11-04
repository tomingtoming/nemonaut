import {saveKind, isSaveKind} from './app-id.js';
import {validateFailureEvents, type FailureEvent} from './failure-events.js';
import {orbitalAscentSettings} from './orbital-ascent-settings.js';
import {runwayEnd} from './runway-selection.js';
import {cruiseSettings} from './cruise-pilot.js';
import {updateNavigationFrame, type NavigationFrame} from './navigation-frame.js';
import {copyObservationQuality} from './observation-quality.js';
import {DELIVERY_SITE, deliverySite} from './delivery-sites.js';
import {createObservations, type ObservationState, type ObservationMap} from './observation.js';
import {restoreSeparationCounters} from './separation-name.js';
import {PHYSICS_MODEL, migrateLegacySurface, type PhysicsMigrationSummary} from './physics-migration.js';
import {validUniversalTime, setUniversalTime} from './universal-time.js';
import {fleet} from './fleet.js';
import {createThermal, type ThermalState} from './thermal.js';
import {resolveTargets, type DockingPortPair} from './relative-navigation.js';
import {createCharge} from './power.js';
import {validateManeuverNode, type ManeuverNodeRecord} from './maneuver-node.js';
import * as T from 'three';
import {validateTransferGuide, type TransferGuide} from './lunar-transfer.js';
import {Flight, statistics, validateCraft, type FlightPart, type WheelMotion} from './core.js';
import {PARTS} from './catalog.js';
import {bodyOrbitState} from './celestial.js';
import {SAS_MODES} from './navigation.js';
const flags = [
  'started',
  'crashed',
  'landed',
  'sas',
  'brake',
  'reactionEnabled',
  'steeringEnabled',
  'driveEnabled'
] as const;
const numberKeys = ['time', 'stage', 'throttle', 'ballast', 'trim', 'maxAltitude', 'landedTime'] as const;
type FlagKey = (typeof flags)[number];
type NumberKey = (typeof numberKeys)[number];
const numbers: Readonly<Record<NumberKey, readonly [number, number]>> = {
  time: [0, 1e12],
  stage: [-1, 1000],
  throttle: [0, 1],
  ballast: [0, 1],
  trim: [-0.6, 0.6],
  maxAltitude: [0, 1e10],
  landedTime: [0, 1e12]
};
/** Saved flight flags and numbers (validated against flags/numbers on load). */
export type SavedFlightState = Record<FlagKey, boolean> & Record<NumberKey, number>;
/** Extra data stored with a saved flight (name, pilot, ...). */
export type SavedFlightMeta = Record<string, unknown>;
/** A flight in the save format written by saveFlight; loadFlight validates every field at runtime because saves are untrusted. */
export interface SavedFlight {
  kind: string;
  version: number;
  vesselId?: string;
  physicsModel?: string;
  physicsMigration?: PhysicsMigrationSummary | null;
  universalTime?: number;
  vesselName?: string;
  separationCount?: number;
  failureEvents?: FailureEvent[];
  failureDynamics?: boolean;
  parts: FlightPart[];
  environment: string;
  pos: import('three').Vector3Tuple;
  vel: number[];
  q: import('three').QuaternionTuple;
  omega: number[];
  holdQ: number[] | null;
  sasMode: string;
  navigationFrame?: NavigationFrame;
  navigationAuto?: boolean;
  orbitalAscentSettings?: Parameters<typeof orbitalAscentSettings>[0] | null;
  runwayEnd?: string;
  cruiseSettings?: Parameters<typeof cruiseSettings>[0];
  targetPartId?: string | null;
  dockingPorts?: DockingPortPair | null;
  portTranslationEnabled?: boolean;
  maneuver?: ManeuverNodeRecord | null;
  transferGuide?: TransferGuide | null;
  state: SavedFlightState;
  /** Landing gear down (BACKLOG 9c); saves written before it load with the gear down. */
  gearDeployed?: boolean;
  rcsEnabled?: boolean;
  fuel: [string, number][];
  charge?: [string, number][];
  observations?: [string, ObservationState][];
  thermal?: [string, ThermalState][];
  active: string[];
  deflections: [string, number][];
  gimbals: [string, number[]][];
  wheelMotion: [string, WheelMotion][];
  chutes: [string, import('./recovery.js').ParachuteState][];
  detached?: SavedFlight[];
  meta?: SavedFlightMeta;
}
/** Shared limits while loading a flight and its detached vessels. */
export interface FlightLoadBudget {
  count: number;
  ids: Set<string>;
  vesselIds: Set<string>;
}
export interface FlightLoadOptions {
  debris?: boolean;
  depth?: number;
  budget?: FlightLoadBudget;
}
const check: (ok: unknown) => asserts ok = ok => {
  if (!ok) throw Error('飛行保存データの形式または値が不正です');
};
const vector = (a: unknown, n: number, limit: number): number[] => {
  check(Array.isArray(a) && a.length === n && a.every(v => Number.isFinite(v) && Math.abs(v) <= limit));
  return a;
};
const quaternion = (a: readonly number[]): readonly number[] => {
  vector(a, 4, 1.01);
  check(Math.abs(a.reduce((s, v) => s + v * v, 0) - 1) < 0.01);
  return a;
};
/** A copied observation quality has both periods (copyObservationQuality throws otherwise); this states it in the type. */
function completeQuality(
  q: ReturnType<typeof copyObservationQuality>
): Required<NonNullable<ReturnType<typeof copyObservationQuality>>> | undefined {
  if (!q) return undefined;
  const {day, night} = q;
  check(day && night);
  return {day, night};
}
/** The part a validated save entry names (entries() only admits ids of the craft's parts). */
function savedPart(byId: ReadonlyMap<string, FlightPart>, id: string): FlightPart {
  const p = byId.get(id);
  check(p);
  return p;
}
function entries<V, R>(
  values: readonly (readonly [string, V])[] | undefined,
  allowed: ReadonlySet<string>,
  read: (v: V, id: string) => R
): Map<string, R> {
  check(Array.isArray(values) && values.length <= 400);
  const out = new Map<string, R>();
  for (const row of values) {
    check(Array.isArray(row) && row.length === 2 && allowed.has(row[0]) && !out.has(row[0]));
    out.set(row[0], read(row[1], row[0]));
  }
  return out;
}
export function saveFlight(f: Flight, meta: SavedFlightMeta = {}): SavedFlight {
  const state: SavedFlightState = {
    started: f.started,
    crashed: f.crashed,
    landed: f.landed,
    sas: f.sas,
    brake: f.brake,
    reactionEnabled: f.reactionEnabled,
    steeringEnabled: f.steeringEnabled,
    driveEnabled: f.driveEnabled,
    time: f.time,
    stage: f.stage,
    throttle: f.throttle,
    ballast: f.ballast,
    trim: f.trim,
    maxAltitude: f.maxAltitude,
    landedTime: f.landedTime
  };
  return structuredClone({
    kind: saveKind('flight'),
    version: 1,
    vesselId: f.vesselId,
    physicsModel: PHYSICS_MODEL,
    physicsMigration: f.physicsMigration ?? null,
    universalTime: f.universalTime,
    vesselName: f.vesselName,
    separationCount: f.separationCount,
    failureEvents: f.failureEvents ?? [],
    failureDynamics: f.failureDynamics === true,
    parts: structuredClone(f.parts),
    environment: f.environment,
    pos: f.pos.toArray(),
    vel: f.vel.toArray(),
    q: f.q.toArray(),
    omega: f.omega.toArray(),
    holdQ: f.holdQ?.toArray() || null,
    sasMode: f.sasMode,
    navigationFrame: f.navigationFrame ?? 'orbit',
    navigationAuto: f.navigationAuto !== false,
    orbitalAscentSettings: f.orbitalAscentSettings ? orbitalAscentSettings(f.orbitalAscentSettings) : null,
    runwayEnd: runwayEnd(f.runwayEnd),
    cruiseSettings: f.cruiseSettings ? cruiseSettings(f.cruiseSettings) : null,
    targetPartId: f.targetPartId,
    dockingPorts: f.dockingPorts,
    portTranslationEnabled: f.portTranslationEnabled,
    maneuver: f.maneuver || null,
    transferGuide: f.transferGuide || null,
    state,
    gearDeployed: f.gearDeployed,
    rcsEnabled: f.rcsEnabled,
    fuel: [...f.fuel],
    charge: [...f.charge],
    observations: [...f.observations],
    thermal: [...f.thermal],
    active: [...f.active],
    deflections: [...f.deflections],
    gimbals: [...f.gimbals].map(([k, v]) => [k, v.toArray()]),
    wheelMotion: [...f.wheelMotion],
    chutes: [...f.chutes],
    detached: f.detached.map(child => saveFlight(child)),
    meta
  });
}
export function loadFlight(
  value: SavedFlight,
  {
    debris = false,
    depth = 0,
    budget = {count: 0, ids: new Set(), vesselIds: new Set()}
  }: FlightLoadOptions = {}
): Flight {
  check(depth <= 32);
  check(isSaveKind(value?.kind, 'flight') && value.version === 1);
  check(value.physicsModel === undefined || value.physicsModel === PHYSICS_MODEL);
  {
    const migration = value.physicsMigration;
    if (migration != null)
      check(
        (['surface', 'inertial'] as const).every(
          k => Number.isInteger(migration[k]) && migration[k] >= 0 && migration[k] <= 400
        )
      );
  }
  const parts = validateCraft({version: 1, parts: value.parts}),
    byId = new Map<string, FlightPart>(parts.map(p => [p.id, p]));
  check(parts.filter(p => !p.parent).length === 1);
  const vesselId = value.vesselId === undefined ? 'legacy:' + parts[0].id : value.vesselId;
  check(
    typeof vesselId === 'string' &&
      vesselId.length > 0 &&
      vesselId.length <= 256 &&
      !budget.vesselIds.has(vesselId)
  );
  budget.vesselIds.add(vesselId);
  budget.count += parts.length;
  check(budget.count <= 400);
  for (const p of parts) {
    check(!budget.ids.has(p.id));
    budget.ids.add(p.id);
  }
  const children = value.detached ?? [];
  check(Array.isArray(children) && children.length <= 400);
  check(
    ['land', 'runway', 'water', 'orbit', 'drop', 'entry', 'moon-orbit', 'moon-surface', 'transfer'].includes(
      value.environment
    )
  );
  vector(value.pos, 3, 1e10);
  vector(value.vel, 3, 1e6);
  vector(value.omega, 3, 1e4);
  quaternion(value.q);
  if (value.holdQ !== null) quaternion(value.holdQ);
  check(Object.hasOwn(SAS_MODES, value.sasMode));
  check(value.navigationAuto === undefined || typeof value.navigationAuto === 'boolean');
  check(value.navigationFrame === undefined || ['orbit', 'surface'].includes(value.navigationFrame));
  check(value.gearDeployed === undefined || typeof value.gearDeployed === 'boolean');
  check(value.state && typeof value.state === 'object');
  for (const k of flags) check(typeof value.state[k] === 'boolean');
  for (const k of numberKeys) {
    const [min, max] = numbers[k];
    check(Number.isFinite(value.state[k]) && value.state[k] >= min && value.state[k] <= max);
  }
  check(Number.isInteger(value.state.stage));
  const ids = new Set(byId.keys()),
    tankIds = new Set(parts.filter(p => PARTS[p.type].fuel || PARTS[p.type].monoprop).map(p => p.id));
  const fuel = entries(value.fuel, tankIds, (v, id) => {
    const d = PARTS[savedPart(byId, id).type],
      capacity = d.fuel || d.monoprop;
    check(capacity !== undefined && Number.isFinite(v) && v >= 0 && v <= capacity);
    return v;
  });
  check(fuel.size === tankIds.size);
  check(
    Array.isArray(value.active) &&
      value.active.length <= 400 &&
      new Set(value.active).size === value.active.length &&
      value.active.every(id => {
        const p = byId.get(id);
        return p !== undefined && !!PARTS[p.type].thrust;
      })
  );
  const deflections = entries(value.deflections, ids, v => {
      check(Number.isFinite(v) && Math.abs(v) <= Math.PI);
      return v;
    }),
    gimbals = entries(value.gimbals, ids, v => new T.Vector3(...vector(v, 3, Math.PI))),
    wheelMotion = entries(value.wheelMotion, ids, v => {
      check(
        v && (['angle', 'speed', 'steer'] as const).every(k => Number.isFinite(v[k]) && Math.abs(v[k]) < 1e6)
      );
      check(
        v.extension === undefined || (Number.isFinite(v.extension) && v.extension >= 0 && v.extension <= 0.18)
      );
      return {
        angle: v.angle,
        speed: v.speed,
        steer: v.steer,
        ...(v.extension === undefined ? {} : {extension: v.extension})
      };
    }),
    chuteIds = new Set(parts.filter(p => PARTS[p.type].parachute).map(p => p.id)),
    chutes = entries(value.chutes, chuteIds, v => {
      check(
        v &&
          ['stowed', 'armed', 'reefed', 'open', 'landed', 'cut'].includes(v.status) &&
          Number.isFinite(v.fraction) &&
          v.fraction >= 0 &&
          v.fraction <= 1
      );
      return {status: v.status, fraction: v.fraction};
    });
  check(chutes.size === chuteIds.size);
  const observationIds = new Set(parts.filter(p => p.type === 'probe').map(p => p.id)),
    observations =
      value.observations === undefined
        ? createObservations(parts)
        : entries(value.observations, observationIds, (s): ObservationState => {
            check(
              s &&
                typeof s.enabled === 'boolean' &&
                (['day', 'night'] as const).every(k => Number.isFinite(s[k]) && s[k] >= 0 && s[k] <= 1e12)
            );
            if (s.sites !== undefined) {
              check(s.sites && typeof s.sites === 'object' && !Array.isArray(s.sites));
              for (const [id, data] of Object.entries(s.sites)) {
                check(
                  id !== DELIVERY_SITE.id &&
                    !!deliverySite(id) &&
                    data &&
                    (['day', 'night'] as const).every(
                      k => Number.isFinite(data[k]) && data[k] >= 0 && data[k] <= 1e12
                    )
                );
                copyObservationQuality(data.quality, data);
              }
            }
            const quality = completeQuality(copyObservationQuality(s.quality, s));
            return {
              enabled: s.enabled,
              day: s.day,
              night: s.night,
              ...(quality ? {quality} : {}),
              ...(s.sites ? {sites: structuredClone(s.sites)} : {})
            };
          });
  check(observations.size === observationIds.size);
  const batteryIds = new Set(parts.filter(p => PARTS[p.type].battery).map(p => p.id)),
    charge =
      value.charge === undefined
        ? createCharge(parts)
        : entries(value.charge, batteryIds, (v, id) => {
            const battery = PARTS[savedPart(byId, id).type].battery;
            check(battery !== undefined && Number.isFinite(v) && v >= 0 && v <= battery);
            return v;
          });
  check(charge.size === batteryIds.size);
  const maneuver = validateManeuverNode(value.maneuver),
    transferGuide = validateTransferGuide(value.transferGuide);
  check(value.sasMode !== 'maneuver' || maneuver !== null);
  check(value.rcsEnabled === undefined || typeof value.rcsEnabled === 'boolean');
  check(
    value.targetPartId === undefined ||
      value.targetPartId === null ||
      (typeof value.targetPartId === 'string' && value.targetPartId.length <= 200)
  );
  {
    const ports = value.dockingPorts;
    check(
      ports === undefined ||
        ports === null ||
        (typeof ports === 'object' &&
          (['own', 'target'] as const).every(k => typeof ports[k] === 'string' && ports[k].length <= 200))
    );
  }
  check(value.portTranslationEnabled === undefined || typeof value.portTranslationEnabled === 'boolean');
  const thermal =
    value.thermal === undefined
      ? createThermal(parts)
      : entries(value.thermal, ids, (v, id) => {
          const d = PARTS[savedPart(byId, id).type];
          check(
            v &&
              Number.isFinite(v.temperature) &&
              v.temperature >= 0 &&
              v.temperature <= 1e9 &&
              Number.isFinite(v.ablator) &&
              v.ablator >= 0 &&
              v.ablator <= (d.ablator || 0) &&
              typeof v.failed === 'boolean'
          );
          return {temperature: v.temperature, ablator: v.ablator, failed: v.failed};
        });
  check(thermal.size === ids.size);
  check(![...thermal.values()].some(s => s.failed) || value.state.crashed);
  check(
    value.vesselName === undefined || (typeof value.vesselName === 'string' && value.vesselName.length <= 80)
  );
  check(
    value.separationCount === undefined ||
      (Number.isSafeInteger(value.separationCount) &&
        value.separationCount >= 0 &&
        value.separationCount <= 1e9)
  );
  if (value.universalTime !== undefined) validUniversalTime(value.universalTime);
  check(value.failureDynamics === undefined || typeof value.failureDynamics === 'boolean');
  check(!value.failureDynamics || value.state.crashed);
  const failureEvents = validateFailureEvents(value.failureEvents);
  const ascent = value.orbitalAscentSettings ? orbitalAscentSettings(value.orbitalAscentSettings) : null;
  const arrivalEnd = runwayEnd(value.runwayEnd);
  const cruise = value.cruiseSettings ? cruiseSettings(value.cruiseSettings) : null;
  const f = new Flight(parts, value.environment);
  f.failureEvents = failureEvents;
  f.failureDynamics = value.failureDynamics ?? false;
  f.orbitalAscentSettings = ascent;
  f.cruiseSettings = cruise;
  f.runwayEnd = arrivalEnd;
  f.vesselId = vesselId;
  f.separationCount = value.separationCount ?? 0;
  f.legacyPhysics = value.physicsModel === undefined;
  f.physicsMigration = value.physicsMigration
    ? {surface: value.physicsMigration.surface, inertial: value.physicsMigration.inertial}
    : null;
  f.universalTime = value.universalTime ?? value.state.time;
  f.vesselName =
    value.vesselName ?? (typeof value.meta?.name === 'string' ? value.meta.name.slice(0, 80) : '機体');
  f.thermal = thermal;
  f.dockingPorts = value.dockingPorts ? structuredClone(value.dockingPorts) : null;
  f.portTranslationEnabled = value.portTranslationEnabled ?? false;
  f.targetPartId = value.targetPartId ?? null;
  f.rcsEnabled = value.rcsEnabled ?? false;
  f.maneuver = maneuver;
  f.transferGuide = transferGuide;
  const s = value.state;
  f.started = s.started;
  f.crashed = s.crashed;
  f.landed = s.landed;
  f.sas = s.sas;
  f.brake = s.brake;
  f.gearDeployed = value.gearDeployed ?? true;
  f.reactionEnabled = s.reactionEnabled;
  f.steeringEnabled = s.steeringEnabled;
  f.driveEnabled = s.driveEnabled;
  f.time = s.time;
  f.stage = s.stage;
  f.throttle = s.throttle;
  f.ballast = s.ballast;
  f.trim = s.trim;
  f.maxAltitude = s.maxAltitude;
  f.landedTime = s.landedTime;
  f.pos.fromArray(value.pos);
  f.vel.fromArray(value.vel);
  f.q.fromArray(value.q).normalize();
  f.omega.fromArray(value.omega);
  f.holdQ = value.holdQ ? new T.Quaternion().fromArray(value.holdQ).normalize() : f.q.clone();
  f.sasMode = value.sasMode;
  f.navigationFrame = value.navigationFrame ?? 'orbit';
  f.navigationAuto = value.navigationAuto ?? true;
  f.fuel = fuel;
  f.charge = charge;
  f.observations = observations;
  f.active = new Set(value.active);
  f.deflections = deflections;
  f.gimbals = gimbals;
  f.wheelMotion = wheelMotion;
  f.chutes = chutes;
  f.buildColliders();
  f.stats = statistics(f.parts, f.fuel, f.ballast, f.thermal, f.gearDeployed);
  f.orbit = bodyOrbitState(
    f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),
    f.vel,
    f.universalTime
  );
  try {
    for (const child of children)
      f.detached.push(loadFlight(child, {debris: true, depth: depth + 1, budget}));
    if (depth === 0) {
      const all = fleet(f),
        time = value.universalTime ?? Math.max(...all.map(v => v.universalTime));
      const checkTimes = (r: SavedFlight): void => {
        if (r.universalTime !== undefined && r.universalTime !== time)
          throw Error('機体間の共通時刻が一致しません');
        for (const child of r.detached ?? []) checkTimes(child);
      };
      if (value.universalTime !== undefined) checkTimes(value);
      setUniversalTime(f, time);
      restoreSeparationCounters(all);
      const migrated = {surface: 0, inertial: 0};
      for (const v of all) {
        if (v.legacyPhysics) migrated[migrateLegacySurface(v) ? 'surface' : 'inertial']++;
        delete v.legacyPhysics;
      }
      if (migrated.surface + migrated.inertial) f.physicsMigration = migrated;
      for (const v of all)
        v.orbit = bodyOrbitState(v.pos.clone().add(v.stats.com.clone().applyQuaternion(v.q)), v.vel, time);
      for (const v of all) updateNavigationFrame(v);
      resolveTargets(f, {strict: true});
    }
  } catch (error) {
    f.dispose();
    throw error;
  }
  return f;
}
