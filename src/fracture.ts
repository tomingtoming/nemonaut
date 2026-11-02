import * as T from 'three';
import {PARTS, type Part} from './catalog.js';
import {normalizeSymmetry} from './symmetry.js';
import {fuelNetworks, type FuelMap, type FuelNetworks} from './resources.js';
import {bodyOrbitState, type OrbitState} from './celestial.js';
/** One piece left after failed parts break away; wreck pieces start from a failed part. */
export interface FractureComponent {
  parts: Part[];
  wreck: boolean;
}
/** Per-part state maps copied to each piece: a value is a Vector3 (cloned) or plain data (structured-cloned). */
export type FractureMapValue = T.Vector3 | {readonly isVector3?: never};
/** True for a three.js Vector3 (its isVector3 flag), which per-part state copies clone instead of structured-cloning. */
const isVector3 = (v: unknown): v is T.Vector3 =>
  typeof v === 'object' && v !== null && 'isVector3' in v && !!v.isVector3;
/** A copy of a per-part state map keeping the entries of `ids`: Vector3 values cloned, plain data structured-cloned. */
export function copyPartState<V>(m: ReadonlyMap<string, V>, ids: ReadonlySet<string>): Map<string, V> {
  return new Map<string, V>(
    [...m].filter(([id]) => ids.has(id)).map(([id, v]) => [id, isVector3(v) ? v.clone() : structuredClone(v)])
  );
}
/** The statistics fields fracture reads. */
export interface FractureStats {
  com: T.Vector3;
}
/** The flight fields fractureVessel reads and resets on every piece (a Flight satisfies it). */
export interface FractureFlight {
  failureDynamics: boolean;
  crashed: boolean;
  parts: Part[];
  fuel: FuelMap;
  charge: Map<string, number>;
  thermal: import('./thermal.js').ThermalMap;
  chutes: Map<string, import('./recovery.js').ParachuteState>;
  observations: Map<string, object>;
  deflections: Map<string, number>;
  gimbals: Map<string, FractureMapValue>;
  wheelMotion: Map<string, FractureMapValue>;
  ballast: number;
  trim: number;
  stats: FractureStats;
  pos: T.Vector3;
  vel: T.Vector3;
  q: T.Quaternion;
  omega: T.Vector3;
  time: number;
  universalTime: number;
  environment: string;
  stage: number;
  started: boolean;
  brake: boolean;
  navigationFrame: string;
  navigationAuto: boolean;
  reactionEnabled: boolean;
  steeringEnabled: boolean;
  driveEnabled: boolean;
  rcsEnabled: boolean;
  failureEvents: import('./failure-events.js').FailureEvent[];
  throttle: number;
  lastThrust: number;
  engineThrust: Map<string, number>;
  rcsJets: import('./rcs.js').RcsJet[];
  sas: boolean;
  sasMode: string;
  holdQ: T.Quaternion | null;
  maneuver: import('./maneuver-node.js').ManeuverNodeRecord | null;
  transferGuide: import('./lunar-transfer.js').TransferGuide | null;
  dockingPorts: {own: string; target: string} | null;
  portTranslationEnabled: boolean;
  active: Set<string>;
  landed: boolean;
  landedTime: number;
  physicsOrigin: T.Vector3 | null;
  networks: FuelNetworks<Part>;
  orbit: OrbitState | null;
  vesselName: string;
  separationCount: number;
  detached: FractureFlight[];
  buildColliders(): void;
}
export type FractureStatistics = (
  parts: readonly Part[],
  fuel: FuelMap,
  ballast: number,
  thermal: import('./thermal.js').ThermalMap
) => FractureStats;

export function fractureComponents(
  parts: readonly Part[],
  failedIds: Iterable<unknown>
): FractureComponent[] {
  const failed = new Set<unknown>(failedIds),
    byId = new Map<string, Part>(parts.map(p => [p.id, p])),
    groups = new Map<string, Part[]>();
  for (const p of parts) {
    let root = p;
    if (!failed.has(p.id))
      for (
        let parent = root.parent ? byId.get(root.parent) : undefined;
        parent && !failed.has(parent.id);
        parent = root.parent ? byId.get(root.parent) : undefined
      )
        root = parent;
    const key = failed.has(p.id) ? p.id : root.id;
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push(structuredClone(p));
  }
  return [...groups.values()].map(group => {
    const ids = new Set<string | null | undefined>(group.map(p => p.id));
    for (const p of group) {
      if (!ids.has(p.parent)) {
        p.parent = null;
        delete p.attachment;
      }
      if (!ids.has(p.dockPartner)) delete p.dockPartner;
    }
    return {parts: normalizeSymmetry(group), wreck: failed.has(group[0].id)};
  });
}

// The caller invokes this after the solver step, never while iterating colliders.
export function fractureVessel(
  f: FractureFlight,
  failedIds: readonly unknown[],
  createFlight: (parts: Part[], environment: string, universalTime: number) => FractureFlight,
  statistics: FractureStatistics
): void {
  if (f.failureDynamics || !failedIds.length) return;
  const components = fractureComponents(f.parts, failedIds);
  const priority = (c: FractureComponent): number =>
    c.parts.some(p => PARTS[p.type].control) ? (c.wreck ? 1 : 2) : c.wreck ? -1 : 0;
  components.sort((a, b) => priority(b) - priority(a) || b.parts.length - a.parts.length);
  const before = {
    ...f,
    stats: statistics(f.parts, f.fuel, f.ballast, f.thermal),
    pos: f.pos.clone(),
    vel: f.vel.clone(),
    q: f.q.clone(),
    omega: f.omega.clone()
  };
  const oldCenter = before.stats.com.clone().applyQuaternion(before.q),
    children: FractureFlight[] = [];
  const initialize = (v: FractureFlight, component: FractureComponent): void => {
    const ids = new Set(component.parts.map(p => p.id));
    v.parts = component.parts;
    v.fuel = copyPartState(before.fuel, ids);
    v.charge = copyPartState(before.charge, ids);
    v.thermal = copyPartState(before.thermal, ids);
    v.chutes = copyPartState(before.chutes, ids);
    v.observations = copyPartState(before.observations, ids);
    v.deflections = copyPartState(before.deflections, ids);
    v.gimbals = copyPartState(before.gimbals, ids);
    v.wheelMotion = copyPartState(before.wheelMotion, ids);
    v.time = before.time;
    v.universalTime = before.universalTime;
    v.environment = before.environment;
    v.stage = before.stage;
    v.started = before.started;
    v.ballast = before.ballast;
    v.trim = before.trim;
    v.brake = before.brake;
    v.navigationFrame = before.navigationFrame;
    v.navigationAuto = before.navigationAuto;
    v.reactionEnabled = before.reactionEnabled;
    v.steeringEnabled = before.steeringEnabled;
    v.driveEnabled = before.driveEnabled;
    v.rcsEnabled = before.rcsEnabled;
    v.failureEvents = structuredClone(before.failureEvents);
    v.failureDynamics = component.wreck;
    v.crashed = component.wreck;
    v.throttle = 0;
    v.lastThrust = 0;
    v.engineThrust = new Map();
    v.rcsJets = [];
    v.sas = !component.wreck && before.sas;
    v.sasMode = 'hold';
    v.holdQ = before.q.clone();
    v.maneuver = null;
    v.transferGuide = null;
    v.dockingPorts = null;
    v.portTranslationEnabled = false;
    v.active = new Set([...before.active].filter(id => ids.has(id) && !component.wreck));
    if (component.wreck) {
      v.rcsEnabled = false;
      v.reactionEnabled = false;
      v.driveEnabled = false;
      v.steeringEnabled = false;
      for (const id of v.fuel.keys()) v.fuel.set(id, 0);
    }
    v.stats = statistics(v.parts, v.fuel, v.ballast, v.thermal);
    v.pos.copy(before.pos);
    v.q.copy(before.q);
    v.omega.copy(before.omega);
    v.vel
      .copy(before.vel)
      .add(before.omega.clone().cross(v.stats.com.clone().applyQuaternion(v.q).sub(oldCenter)));
    v.landed = false;
    v.landedTime = 0;
    v.physicsOrigin = null;
    v.networks = fuelNetworks(v.parts);
    v.buildColliders();
    v.orbit = bodyOrbitState(
      v.pos.clone().add(v.stats.com.clone().applyQuaternion(v.q)),
      v.vel,
      v.universalTime
    );
  };
  for (const component of components.slice(1)) {
    const child = createFlight(component.parts, before.environment, before.universalTime);
    initialize(child, component);
    child.vesselName = (
      before.vesselName +
      ' / ' +
      (component.wreck ? '残骸' : '分裂') +
      ' ' +
      ++f.separationCount
    ).slice(0, 80);
    children.push(child);
  }
  initialize(f, components[0]);
  f.detached.push(...children);
}
