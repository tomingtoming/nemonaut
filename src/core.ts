import {instrumentForward, instrumentRotation, usesAxialControls} from './command-frame.js';
import {isParked} from './ground-rest.js';
import {fractureVessel, copyPartState} from './fracture.js';
import {recordFailure, type FailureEvent} from './failure-events.js';
import {cargoReleaseAllowed, cargoReleaseDirection} from './cargo-access.js';
import {createPartColliders, type PartCollider} from './part-colliders.js';
import {attitudeCommands} from './flight-input.js';
import {updateNavigationFrame, type NavigationFrame} from './navigation-frame.js';
import {sasTrim, type SasTrimAxes} from './sas-trim.js';
import {followBankHeading, manualAttitudeTarget} from './sas-attitude.js';
import {
  createObservations,
  observationDemand,
  advanceObservations,
  type ObservationMap
} from './observation.js';
import {createBodyAerodynamics, bodyDrag, type BodyAerodynamics} from './body-drag.js';
import {foldedGearCenter, gearMassCenter, gearRetracted} from './landing-gear.js';
import {separationName} from './separation-name.js';
import {
  displacedVolume,
  mediumDensity,
  submergedFraction,
  waterResistance,
  WATER_DENSITY
} from './buoyancy.js';
import {engineSubmersion} from './engine-medium.js';
import {angularMomentum, angularVelocity} from './angular-momentum.js';
import {transferFuel} from './fuel-transfer.js';
import {advanceWorldPhysics} from './world-physics.js';
import {fleet, canControl} from './fleet.js';
import {
  launchSiteOrientation,
  overWater,
  shoreline,
  frozenSurfaceState,
  surfaceAngularVelocity,
  surfaceOrientation,
  surfaceVelocity,
  surfaceRelativeVelocity,
  rotatingFrameCorrection
} from './surface-frame.js';
import {
  lunarTransferSeed,
  createTransferGuide,
  advanceTransferGuide,
  type TransferGuide
} from './lunar-transfer.js';
import {validateAttachments} from './attachment-nodes.js';
import {createThermal, thermalStep, type ThermalMap, type ThermalStepResult} from './thermal.js';
import {portGuidance, portTranslation, type PortVessel} from './port-navigation.js';
import {relativeState, resolveTargets, type DockingPortPair} from './relative-navigation.js';
import {rcsThrusters, mixRCS, burnRCS, type RcsJet} from './rcs.js';
import {createCharge, powerStep, type ChargeMap, type PowerReading} from './power.js';
import {maneuverDirection, advanceManeuver, type ManeuverNodeRecord} from './maneuver-node.js';
import {validateSymmetry} from './symmetry.js';
import * as T from 'three';
import {PARTS, type Part} from './catalog.js';
import RAPIER from './physics.js';
import {
  partRotation,
  partMass,
  partCenter,
  aeroPoint,
  aeroAnalysis,
  surfaceForce,
  surfaceForceScale,
  controlDeflection,
  type AeroPart,
  type MassPart,
  type AeroAnalysis
} from './aero.js';
import {PLANET, atmosphere} from './planet.js';
import {
  MOON,
  referenceBody,
  bodyState,
  bodyAltitude,
  bodyUp,
  bodyGravity,
  bodyOrbitState,
  advanceCelestialOrbit,
  lunarTrial,
  type OrbitState
} from './celestial.js';
import {parachuteStep, parachuteDrag, type ParachuteState} from './recovery.js';
import {navDirections, attitudeTarget, type NavDirections} from './navigation.js';
import {
  createFuel,
  fuelNetworks,
  engineBurn,
  engineMaxThrust,
  vacuumIsp,
  type FuelMap,
  type FuelNetworks,
  type ResourcePart
} from './resources.js';
await RAPIER.init();
/** Where a docked part came from: its vessel name and mission epoch (kept through dock/undock). */
export interface MissionOrigin {
  name: string;
  epoch: number;
}
/** A craft part as validateCraft accepts it and Flight holds it: the catalog Part plus the per-part settings. */
export interface FlightPart extends Part {
  fuelLoad?: number;
  thrustLimit?: number;
  controlLimit?: number;
  controlPitch?: boolean;
  controlYaw?: boolean;
  controlRoll?: boolean;
  fuelCrossfeed?: boolean;
  missionOrigin?: MissionOrigin;
}
/** A saved or designed craft before validation (untyped callers pass any parts and get them back as any). */
export interface CraftRecord<A extends FlightPart[] = FlightPart[]> {
  version?: unknown;
  parts?: A;
}
/** The part fields statistics reads. */
export type StatisticsPart = AeroPart &
  MassPart &
  Pick<ResourcePart, 'thrustLimit'> & {parent?: string | null};
/** Mass, propulsion and aerodynamic summary of a set of parts (statistics). */
export interface FlightStats {
  mass: number;
  dry: number;
  fuel: number;
  thrust: number;
  com: T.Vector3;
  twr: number;
  dv: number;
  aero: AeroAnalysis;
}
/** Pilot input for one step; omitted axes are zero. */
export interface FlightInput {
  assemblyAttitude?: {pitch?: number; yaw?: number; roll?: number};
  pitch?: number;
  yaw?: number;
  roll?: number;
  precision?: boolean;
  drive?: number;
  translateX?: number;
  translateY?: number;
  translateZ?: number;
  portForward?: number;
  portRight?: number;
  portUp?: number;
}
/** Wheel animation and suspension state per wheel part (plain data: structured-cloned, never a Vector3). */
export interface WheelMotion {
  angle: number;
  speed: number;
  steer: number;
  extension?: number;
  readonly isVector3?: never;
}
/** A wheel touching the ground during a step. */
export interface WheelContact {
  id: string;
  point: T.Vector3Tuple;
  halfAxle: T.Vector3Tuple;
  time: number;
}
/** What stepBody reports about the last step (empty until the first step). */
export interface FlightTelemetry {
  thermal: ThermalStepResult;
  force: T.Vector3;
  torque: T.Vector3;
  engineForce: T.Vector3;
  power: PowerReading;
  stallCount: number;
  contacts: number;
  wheelContacts: WheelContact[];
  wheelImpactSpeed: number;
  commands: ReturnType<typeof attitudeCommands>;
  engine: string;
  atmosphere?: ReturnType<typeof atmosphere>;
  surfaceSpeed?: number;
  groundContact?: boolean;
}
/** The navigation target as stepBody reads it: a vessel or a start-of-step snapshot of one. */
export type FlightTarget = PortVessel;
/** Per-part state maps that separation copies: a value is a Vector3 (cloned) or plain data (structured-cloned). */
/** Throws for state the flight must hold (a lookup that cannot miss for a valid craft). */
function missing(what: string, id: string): never {
  throw Error(what + 'が見つかりません: ' + id);
}
/** The NavDirections entry an SAS mode names, or undefined for the other modes. */
function navDirection(d: NavDirections, mode: string): T.Vector3 | null | undefined {
  return mode === 'radial' ||
    mode === 'antiradial' ||
    mode === 'prograde' ||
    mode === 'retrograde' ||
    mode === 'normal' ||
    mode === 'antinormal'
    ? d[mode]
    : undefined;
}
export function validateCraft<A extends FlightPart[] = FlightPart[]>(
  value: CraftRecord<A> | null | undefined
): A {
  if (
    !value ||
    value.version !== 1 ||
    !Array.isArray(value.parts) ||
    !value.parts.length ||
    value.parts.length > 400
  )
    throw Error('機体形式または部品数が不正です（1〜400部品）。');
  const ids = new Set();
  for (const p of value.parts) {
    if (
      !PARTS[p.type] ||
      typeof p.id !== 'string' ||
      ids.has(p.id) ||
      !(['p', 'r'] as const).every(
        k =>
          Array.isArray(p[k]) &&
          p[k].length === 3 &&
          p[k].every(n => Number.isFinite(n) && Math.abs(n) < 10000)
      ) ||
      !Number.isInteger(p.stage) ||
      p.stage < 0 ||
      p.stage > 9
    )
      throw Error('部品データが不正です。');
    if (
      p.referenceDirection !== undefined &&
      (!PARTS[p.type].commandFrame ||
        !Number.isInteger(p.referenceDirection) ||
        p.referenceDirection < 0 ||
        p.referenceDirection > 3)
    )
      throw Error('操縦基準が不正です');
    for (const key of [
      'cargoOpen',
      'reactionEnabled',
      'steeringEnabled',
      'driveEnabled',
      'controlEnabled',
      'gimbalEnabled',
      'controlPitch',
      'controlYaw',
      'controlRoll',
      'fuelCrossfeed',
      'fuelEnabled'
    ] as const)
      if (p[key] !== undefined && typeof p[key] !== 'boolean') throw Error('部品の操作設定が不正です。');
    if (p.cargoOpen !== undefined && !PARTS[p.type].cargoBay) throw Error('貨物扉は貨物胴体の設定です。');
    if (p.fuelEnabled !== undefined && !PARTS[p.type].fuel && !PARTS[p.type].monoprop)
      throw Error('燃料使用は推進剤を持つ部品の設定です。');
    if (p.fuelCrossfeed !== undefined && !PARTS[p.type].docking) throw Error('燃料通過はポートの設定です。');
    if (
      p.fuelLoad !== undefined &&
      (!(PARTS[p.type].fuel || PARTS[p.type].monoprop) ||
        !Number.isFinite(p.fuelLoad) ||
        p.fuelLoad < 0 ||
        p.fuelLoad > 1)
    )
      throw Error('燃料搭載量は0〜100%です。');
    if (
      p.thrustLimit !== undefined &&
      (!PARTS[p.type].thrust || !Number.isFinite(p.thrustLimit) || p.thrustLimit < 0 || p.thrustLimit > 1)
    )
      throw Error('推力上限は0〜100%です。');
    if (
      p.controlLimit !== undefined &&
      (!PARTS[p.type].controlAxis ||
        !Number.isFinite(p.controlLimit) ||
        p.controlLimit < 0 ||
        p.controlLimit > 1)
    )
      throw Error('舵角上限が不正です。');
    if (p.missionOrigin !== undefined) {
      const m = p.missionOrigin;
      if (
        !m ||
        typeof m.name !== 'string' ||
        m.name.length > 80 ||
        !Number.isFinite(m.epoch) ||
        Math.abs(m.epoch) > 1e12
      )
        throw Error('機体のミッション情報が不正です。');
    }
    ids.add(p.id);
  }
  for (const p of value.parts) {
    if (p.parent && !ids.has(p.parent)) throw Error('接続先が見つかりません。');
    const seen = new Set([p.id]);
    let n = p;
    while (n.parent) {
      if (seen.has(n.parent)) throw Error('接続に循環があります。');
      seen.add(n.parent);
      const next = value.parts.find(x => x.id === n.parent);
      if (!next) throw Error('接続先が見つかりません。');
      n = next;
    }
  }
  for (const p of value.parts)
    if (p.dockPartner !== undefined) {
      const partner = value.parts.find(x => x.id === p.dockPartner);
      if (
        typeof p.dockPartner !== 'string' ||
        !PARTS[p.type].docking ||
        !partner ||
        partner === p ||
        !PARTS[partner.type].docking ||
        partner.dockPartner !== p.id ||
        (p.parent !== partner.id && partner.parent !== p.id)
      )
        throw Error('ドッキング接続が不正です。');
    }
  validateSymmetry(value.parts);
  validateAttachments(value.parts);
  return structuredClone(value.parts);
}
export function descendants(parts: readonly {id: string; parent?: string | null}[], id: string): Set<string> {
  const set = new Set([id]);
  let change = true;
  while (change) {
    change = false;
    for (const p of parts)
      if (p.parent != null && set.has(p.parent) && !set.has(p.id)) {
        set.add(p.id);
        change = true;
      }
  }
  return set;
}
export function statistics(
  parts: readonly StatisticsPart[],
  fuelRatio: FuelMap | number = 1,
  ballast = 0,
  thermal: ReadonlyMap<string, {ablator?: number}> | null = null,
  gearDeployed = true
): FlightStats {
  let mass = 0,
    dry = 0,
    fuel = 0,
    thrust = 0,
    weightedIsp = 0;
  const com = new T.Vector3();
  for (const p of parts) {
    const d = PARTS[p.type],
      m = partMass(p, fuelRatio, ballast, thermal);
    mass += m;
    dry +=
      d.mass +
      (thermal?.get(p.id)?.ablator ?? d.ablator ?? 0) +
      (d.monoprop
        ? fuelRatio instanceof Map
          ? fuelRatio.get(p.id) || 0
          : d.monoprop * fuelRatio * (p.fuelLoad ?? 1)
        : 0);
    fuel += d.fuel || 0;
    thrust += engineMaxThrust(p);
    weightedIsp += engineMaxThrust(p) * (d.isp || 0);
    // Folded gear carries its mass up into the body (landing-gear.ts), as its collider does.
    com.addScaledVector(gearMassCenter(p, parts, gearDeployed), m);
  }
  com.divideScalar(mass || 1);
  const isp = weightedIsp / (thrust || 1);
  return {
    mass,
    dry,
    fuel,
    thrust,
    com,
    twr: thrust / (mass * 9.81),
    dv: fuel
      ? isp *
        9.81 *
        Math.log(mass / (dry + ballast * parts.reduce((s, p) => s + (PARTS[p.type].ballast || 0), 0)))
      : 0,
    aero: aeroAnalysis(parts, com)
  };
}
const up = new T.Vector3(0, 1, 0);
function extentY(p: AeroPart, q = new T.Quaternion()) {
  const d = PARTS[p.type],
    e = new T.Matrix4().makeRotationFromQuaternion(q.clone().multiply(partRotation(p))).elements;
  return (Math.abs(e[1]) * d.size[0] + Math.abs(e[5]) * d.size[1] + Math.abs(e[9]) * d.size[2]) / 2;
}
export class Flight {
  declare active: Set<string>;
  declare ballast: number;
  declare body: import('./physics.js').RigidBody;
  declare bodyAerodynamics: BodyAerodynamics;
  declare brake: boolean;
  declare charge: ChargeMap;
  declare chutes: Map<string, ParachuteState>;
  declare colliderGroups: Map<string, PartCollider[]>;
  declare colliders: Map<string, import('./physics.js').Collider>;
  declare crashed: boolean;
  declare deflections: Map<string, number>;
  declare detached: Flight[];
  declare dockingPorts: DockingPortPair | null;
  declare driveEnabled: boolean;
  declare engineThrust: Map<string, number>;
  declare environment: string;
  declare failureDynamics: boolean;
  declare failureEvents: FailureEvent[];
  declare floor: number;
  declare fuel: FuelMap;
  /** Landing gear down (BACKLOG 9c): one switch for the vessel's retractable gear, deployed at launch. */
  declare gearDeployed: boolean;
  declare gimbals: Map<string, T.Vector3>;
  declare ground: import('./physics.js').Collider | undefined;
  declare holdQ: T.Quaternion;
  declare landed: boolean;
  declare landedTime: number;
  declare lastThrust: number;
  declare maneuver: ManeuverNodeRecord | null;
  declare maxAltitude: number;
  declare navigationAuto: boolean;
  declare navigationFrame: NavigationFrame;
  declare navigationTarget: Flight | null;
  declare networks: FuelNetworks<FlightPart>;
  declare observations: ObservationMap;
  declare omega: T.Vector3;
  declare orbit: OrbitState;
  declare parts: FlightPart[];
  declare physicsOrigin: T.Vector3 | null;
  declare portTranslationEnabled: boolean;
  declare pos: T.Vector3;
  declare q: T.Quaternion;
  declare rcsEnabled: boolean;
  declare rcsJets: RcsJet[];
  declare reactionEnabled: boolean;
  get instrumentRotation() {
    return instrumentRotation(this.parts, this.rocketAxes, PARTS);
  }
  // Staging and fracture replace the part list on the surviving Flight instance.
  private axisParts?: FlightPart[];
  private axialControls = false;
  get rocketAxes(): boolean {
    if (this.axisParts !== this.parts) {
      this.axialControls = usesAxialControls(this.parts, PARTS);
      this.axisParts = this.parts;
    }
    return this.axialControls;
  }
  declare sas: boolean;
  declare sasMode: string;
  declare separationCount: number;
  declare stage: number;
  declare started: boolean;
  declare stats: FlightStats;
  declare steeringEnabled: boolean;
  declare targetPartId: string | null;
  declare telemetry: Partial<FlightTelemetry> & Pick<FlightTelemetry, 'contacts'>;
  declare thermal: ThermalMap;
  declare throttle: number;
  declare time: number;
  declare trim: number;
  declare universalTime: number;
  declare vel: T.Vector3;
  declare vesselId: string;
  declare vesselName: string;
  declare wheelMotion: Map<string, WheelMotion>;
  declare world: import('./physics.js').World;
  declare transferGuide: TransferGuide | null;
  declare orbitalAscentSettings: ReturnType<
    typeof import('./orbital-ascent-settings.js').orbitalAscentSettings
  > | null;
  declare cruiseSettings: import('./cruise-pilot.js').CruiseSettings | null;
  declare runwayEnd: import('./runway-selection.js').RunwayEnd;
  declare legacyPhysics?: boolean;
  declare physicsMigration: import('./physics-migration.js').PhysicsMigrationSummary | null;
  constructor(parts: FlightPart[], environment: string, universalTime = 0) {
    this.vesselId = crypto.randomUUID();
    this.parts = structuredClone(parts);
    this.vesselName = '';
    this.separationCount = 0;
    this.failureEvents = [];
    this.failureDynamics = false;
    this.environment = environment;
    this.physicsOrigin = null;
    this.q = new T.Quaternion();
    this.pos = new T.Vector3();
    this.vel = new T.Vector3();
    this.omega = new T.Vector3();
    this.fuel = createFuel(this.parts);
    this.charge = createCharge(this.parts);
    this.observations = createObservations(this.parts);
    this.thermal = createThermal(this.parts);
    this.networks = fuelNetworks(this.parts);
    this.engineThrust = new Map<string, number>();
    this.rcsEnabled = false;
    this.rcsJets = [];
    this.ballast = 0;
    this.throttle = 0;
    this.sas = true;
    this.sasMode = 'hold';
    this.navigationFrame = 'orbit';
    this.navigationAuto = true;
    this.maneuver = null;
    this.transferGuide = null;
    this.targetPartId = null;
    this.dockingPorts = null;
    this.portTranslationEnabled = false;
    this.navigationTarget = null;
    this.brake = true;
    this.gearDeployed = true;
    this.time = 0;
    this.universalTime = universalTime;
    this.stage = -1;
    this.crashed = false;
    this.started = false;
    this.maxAltitude = 0;
    this.stats = statistics(parts);
    this.floor = -Math.min(...parts.map(p => partCenter(p).y - extentY(p)));
    this.pos.y = environment === 'water' ? -0.35 : this.floor + 0.1;
    this.active = new Set<string>();
    this.lastThrust = 0;
    this.detached = [];
    this.deflections = new Map<string, number>();
    this.wheelMotion = new Map<string, WheelMotion>();
    this.gimbals = new Map<string, T.Vector3>();
    this.telemetry = {contacts: 0};
    this.chutes = new Map<string, ParachuteState>(
      this.parts.filter(p => PARTS[p.type].parachute).map(p => [p.id, {status: 'stowed', fraction: 0}])
    );
    this.landed = false;
    this.landedTime = 0;
    this.trim = 0;
    this.reactionEnabled = true;
    this.steeringEnabled = true;
    this.driveEnabled = true;
    this.world = new RAPIER.World({x: 0, y: -9.81, z: 0});
    this.world.numSolverIterations = 8;
    // Rapier JS 0.21 does not expose normalized_max_linear_velocity (default 400).
    // Raise its velocity scale to 40 km/s, preserving meter-sized contact tolerances.
    this.world.integrationParameters.lengthUnit = 100;
    this.world.integrationParameters.normalizedAllowedLinearError = 0.005 / 100;
    this.world.integrationParameters.normalizedPredictionDistance = 0.02 / 100;
    this.ground = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(2000, 1, 2000).setTranslation(0, -1, 0).setFriction(0.3)
    );
    this.body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(this.pos.x, this.pos.y, this.pos.z)
        .setCanSleep(false)
        .setCcdEnabled(true)
    );
    this.colliders = new Map();
    this.buildColliders();
    if (environment === 'entry') {
      this.vel.set(0, -80, 2200);
      this.q.setFromUnitVectors(up, this.vel.clone().normalize().negate());
      this.pos.set(0, 45000, 0).sub(this.stats.com.clone().applyQuaternion(this.q));
      this.sasMode = 'retrograde';
    }
    if (environment === 'drop') {
      this.pos.set(0, 1000, 0).sub(this.stats.com);
      this.vel.set(0, -50, 0);
    }
    if (environment === 'orbit') {
      this.q.setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2);
      this.pos.set(0, 80000, 0).sub(this.stats.com.clone().applyQuaternion(this.q));
      this.vel.set(0, 0, Math.sqrt(PLANET.mu / 680000));
    }
    if (environment === 'transfer') {
      const engines = parts.filter(
          p => PARTS[p.type].thrust && PARTS[p.type].thrustMedium === 'independent' && p.stage === 0
        ),
        thrust = engines.reduce((s, p) => s + engineMaxThrust(p), 0),
        isp = thrust / engines.reduce((s, p) => s + engineMaxThrust(p) / vacuumIsp(p), 0);
      const seed = lunarTransferSeed(universalTime, {
        mass: this.stats.mass,
        thrust: thrust || 45000,
        isp: isp || 300,
        preparation: 60
      });
      this.q.setFromUnitVectors(up, seed.direction);
      this.pos.copy(seed.position).sub(this.stats.com.clone().applyQuaternion(this.q));
      this.vel.copy(seed.velocity);
      this.sasMode = 'prograde';
      this.transferGuide = createTransferGuide(seed);
    }
    if (environment === 'moon-surface') {
      const moon = bodyState(MOON, universalTime);
      this.pos.copy(moon.position).add(new T.Vector3(0, MOON.radius + this.floor + 0.1, 0));
      this.vel.copy(moon.velocity);
      this.sasMode = 'radial';
    }
    if (environment === 'moon-orbit') {
      const trial = lunarTrial(universalTime);
      this.q.setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2);
      this.pos.copy(trial.pos).sub(this.stats.com.clone().applyQuaternion(this.q));
      this.vel.copy(trial.vel);
    }
    if (['land', 'runway', 'water', 'drop', 'entry'].includes(environment)) {
      const orientation = surfaceOrientation(universalTime).multiply(launchSiteOrientation(environment)),
        primaryCenter = bodyState({id: 'planet'}, universalTime).position;
      this.pos.sub(primaryCenter).applyQuaternion(orientation).add(primaryCenter);
      this.q.premultiply(orientation);
      this.vel
        .applyQuaternion(orientation)
        .add(
          surfaceVelocity(this.pos.clone().add(this.stats.com.clone().applyQuaternion(this.q)), universalTime)
        );
      this.omega.copy(surfaceAngularVelocity());
    }
    updateNavigationFrame(this, {reset: true});
  }
  get fuelRatio(): number {
    const capacity = this.parts.reduce((s, p) => s + (PARTS[p.type].fuel || 0), 0);
    return capacity
      ? this.parts.reduce((s, p) => s + (PARTS[p.type].fuel ? this.fuel.get(p.id) || 0 : 0), 0) / capacity
      : 1;
  }
  set fuelRatio(value: number) {
    for (const p of this.parts) {
      const fuel = PARTS[p.type].fuel;
      if (fuel) this.fuel.set(p.id, fuel * Math.max(0, Math.min(1, value)));
    }
  }
  /** The statistics of this vessel's parts and state, the gear position included. */
  vesselStats(): FlightStats {
    return statistics(this.parts, this.fuel, this.ballast, this.thermal, this.gearDeployed);
  }
  buildColliders(): void {
    // Retracted gear is inside the body: no drag of its own (BACKLOG 9c).
    this.bodyAerodynamics = createBodyAerodynamics(
      this.parts.filter(p => !gearRetracted(p, this.gearDeployed))
    );
    for (const group of this.colliderGroups?.values() || [])
      for (const {collider} of group) this.world.removeCollider(collider, true);
    this.colliders.clear();
    this.colliderGroups = new Map();
    for (const p of this.parts) {
      const group = createPartColliders(
        this.world,
        this.body,
        p,
        partMass(p, this.fuel, this.ballast, this.thermal),
        {folded: gearRetracted(p, this.gearDeployed) ? foldedGearCenter(p, this.parts) : undefined}
      );
      this.colliderGroups.set(p.id, group);
      this.colliders.set(p.id, group[0].collider);
    }
    this.body.recomputeMassPropertiesFromColliders();
  }
  updateColliderMasses() {
    for (const p of this.parts) {
      const mass = partMass(p, this.fuel, this.ballast, this.thermal);
      for (const {collider, weight} of this.colliderGroups.get(p.id) ?? missing('部品のコライダー', p.id))
        collider.setMass(mass * weight);
    }
    this.body.recomputeMassPropertiesFromColliders();
  }

  transferFuel(from: string, to: string, amount: number): number {
    const before = this.vesselStats();
    this.updateColliderMasses();
    const momentum = angularMomentum(this.body, this.q, this.omega),
      moved = transferFuel(this, from, to, amount);
    if (!moved) return 0;
    this.stats = this.vesselStats();
    // In free flight internal redistribution must not teleport the world-space COM.
    if (!this.landed) this.pos.add(before.com.clone().sub(this.stats.com).applyQuaternion(this.q));
    this.updateColliderMasses();
    if (!this.landed) this.omega.copy(angularVelocity(this.body, this.q, momentum));
    this.orbit = bodyOrbitState(
      this.pos.clone().add(this.stats.com.clone().applyQuaternion(this.q)),
      this.vel,
      this.universalTime
    );
    return moved;
  }
  armParachutes() {
    for (const state of this.chutes.values()) if (state.status === 'stowed') state.status = 'armed';
  }
  /** Breaks the given parts away (vessel-collision calls this so that it does not need the Flight class or statistics). */
  fractureParts(ids: readonly string[]): void {
    fractureVessel(this, ids, (parts, environment, time) => new Flight(parts, environment, time), statistics);
  }
  dispose() {
    for (const child of this.detached) child.dispose();
    this.world.free();
  }
  stageNext() {
    if (!this.started) this.brake = false;
    this.stage++;
    this.started = true;
    for (const p of this.parts)
      if (PARTS[p.type].parachute && p.stage === this.stage) {
        const chute = this.chutes.get(p.id);
        if (chute?.status === 'stowed') chute.status = 'armed';
      }
    for (const p of this.parts) if (p.stage === this.stage && PARTS[p.type].thrust) this.active.add(p.id);
    return this.separateRoots(
      this.parts.filter(p => p.parent && PARTS[p.type].decoupler && p.stage === this.stage)
    );
  }
  canDecouplePart(id: string): boolean {
    const p = this.parts.find(p => p.id === id);
    return !!(
      canControl(this) &&
      p?.parent &&
      PARTS[p.type].decoupler &&
      cargoReleaseAllowed(this.parts, p) &&
      !this.thermal.get(id)?.failed
    );
  }
  decouplePart(id: string): Set<string> {
    if (!this.canDecouplePart(id)) return new Set<string>();
    const part = this.parts.find(p => p.id === id);
    if (!part) throw Error('分離する部品が見つかりません: ' + id);
    return this.separateRoots([part]);
  }
  separateRoots(roots: FlightPart[]): Set<string> {
    roots = roots.filter(p => cargoReleaseAllowed(this.parts, p));
    const releaseDirections = roots.map(p => cargoReleaseDirection(this.parts, p));
    const remove = new Set<string>();
    for (const p of roots) for (const id of descendants(this.parts, p.id)) remove.add(id);
    if (remove.size) {
      this.transferGuide = null;
      const before = this.vesselStats(),
        originalVelocity = this.vel.clone(),
        oldCOM = before.com.clone().applyQuaternion(this.q);
      const children: Flight[] = [];
      for (const root of roots) {
        const ids = descendants(this.parts, root.id);
        for (const other of roots)
          if (other.id !== root.id && ids.has(other.id))
            for (const id of descendants(this.parts, other.id)) ids.delete(id);
        const branch = this.parts
            .filter(p => ids.has(p.id))
            .map(p => ({...structuredClone(p), parent: p.id === root.id ? null : p.parent})),
          child = new Flight(branch, this.environment);
        child.navigationFrame = this.navigationFrame;
        child.navigationAuto = this.navigationAuto;
        child.transferGuide = null;
        child.fuel = new Map([...this.fuel].filter(([id]) => ids.has(id)));
        child.charge = new Map([...this.charge].filter(([id]) => ids.has(id)));
        child.pos.copy(this.pos);
        child.q.copy(this.q);
        child.omega.copy(this.omega);
        child.time = this.time;
        child.universalTime = this.universalTime;
        child.vesselName = separationName(this.vesselName, ++this.separationCount);
        child.stage = this.stage;
        child.started = this.started;
        child.throttle = this.throttle;
        child.ballast = this.ballast;
        child.trim = this.trim;
        child.brake = this.brake;
        child.gearDeployed = this.gearDeployed;
        child.sas = branch.some(p => PARTS[p.type].control) && this.sas;
        child.holdQ = this.q.clone();
        for (const key of ['reactionEnabled', 'driveEnabled', 'steeringEnabled', 'rcsEnabled'] as const)
          child[key] = this[key];
        child.active = new Set([...this.active].filter(id => ids.has(id)));
        child.thermal = copyPartState(this.thermal, ids);
        child.chutes = copyPartState(this.chutes, ids);
        child.deflections = copyPartState(this.deflections, ids);
        child.gimbals = copyPartState(this.gimbals, ids);
        child.wheelMotion = copyPartState(this.wheelMotion, ids);
        child.observations = copyPartState(this.observations, ids);
        child.stats = child.vesselStats();
        child.vel
          .copy(originalVelocity)
          .add(this.omega.clone().cross(child.stats.com.clone().applyQuaternion(this.q).sub(oldCOM)));
        child.buildColliders();
        children.push(child);
      }
      this.detached.push(...children);
      this.parts = this.parts.filter(p => !remove.has(p.id));
      for (const p of this.parts) if (p.parent != null && remove.has(p.parent)) p.parent = null;
      for (const id of remove) {
        this.active.delete(id);
        this.fuel.delete(id);
        this.charge.delete(id);
        this.observations.delete(id);
        this.thermal.delete(id);
        this.chutes.delete(id);
        this.deflections.delete(id);
        this.gimbals.delete(id);
        this.wheelMotion.delete(id);
      }
      this.networks = fuelNetworks(this.parts);
      this.buildColliders();
      const remaining = this.vesselStats();
      this.vel
        .copy(originalVelocity)
        .add(this.omega.clone().cross(remaining.com.clone().applyQuaternion(this.q).sub(oldCOM)));
      for (const child of children) {
        const direction = (
          releaseDirections[children.indexOf(child)] || child.stats.com.clone().sub(remaining.com)
        )
          .clone()
          .applyQuaternion(this.q);
        if (direction.lengthSq() < 1e-8) direction.set(0, -1, 0).applyQuaternion(this.q);
        direction.normalize();
        const impulse = direction.multiplyScalar(0.5 / (1 / child.stats.mass + 1 / remaining.mass));
        child.vel.addScaledVector(impulse, 1 / child.stats.mass);
        this.vel.addScaledVector(impulse, -1 / remaining.mass);
        child.orbit = bodyOrbitState(
          child.pos.clone().add(child.stats.com.clone().applyQuaternion(child.q)),
          child.vel,
          child.universalTime
        );
      }
    }
    this.stats = this.vesselStats();
    return remove;
  }
  step(dt: number, input: FlightInput = {}): number {
    resolveTargets(this);
    return advanceWorldPhysics(fleet<Flight>(this), this.universalTime, dt, this.vesselId, input);
  }
  stepBody(
    dt: number,
    input: FlightInput = {},
    navigationTarget: FlightTarget | null = this.navigationTarget
  ): void {
    if (!this.parts.some(p => PARTS[p.type].control)) input = {};
    updateNavigationFrame(this, {time: this.universalTime - dt});
    const startTime = this.universalTime - dt,
      reference = referenceBody(this.pos, startTime),
      startBody = bodyState(reference, startTime),
      endBody = bodyState(reference, this.universalTime);
    if (this.crashed && !this.failureDynamics) {
      const frozen = frozenSurfaceState(this, startTime, dt);
      this.pos.copy(frozen.pos);
      this.q.copy(frozen.q);
      this.vel.copy(frozen.vel);
      this.omega.copy(frozen.omega);
      if (this.holdQ) this.holdQ.premultiply(frozen.turn).normalize();
      this.orbit = bodyOrbitState(
        this.pos.clone().add(this.stats.com.clone().applyQuaternion(this.q)),
        this.vel,
        this.universalTime
      );
      return;
    }
    if (!this.parts.length) return;
    this.time += dt;
    const failedParts = new Set<string>(),
      resting = isParked(this) ? frozenSurfaceState(this, startTime, dt) : null;
    const altitude = (p: T.Vector3) => bodyAltitude(p, startTime, reference),
      localUp = (p: T.Vector3) => bodyUp(p, startTime, reference),
      gravity = (p: T.Vector3) => bodyGravity(p, startTime, reference),
      startCOM = this.pos.clone().add(this.vesselStats().com.applyQuaternion(this.q)),
      spin = surfaceAngularVelocity(reference),
      relativeOmega = this.omega.clone().sub(spin),
      relativeVelocity = surfaceRelativeVelocity(startCOM, this.vel, startTime, reference);
    // Floating local physics origin: the solver never sees planet-scale coordinates.
    const normal = localUp(this.pos),
      height = altitude(this.pos),
      craftRadius = this.parts.reduce(
        (m, p) => Math.max(m, new T.Vector3(...p.p).length() + Math.max(...PARTS[p.type].size)),
        0
      ),
      freeFlight = height > craftRadius + 25;
    // Large length units also enlarge internal contact tolerances. Use metre-scale
    // contact at low speed, keeping headroom above the solver's velocity limit.
    const solverScale = freeFlight ? 100 : Math.max(1, relativeVelocity.length() / 100);
    this.world.integrationParameters.lengthUnit = solverScale;
    this.world.integrationParameters.normalizedAllowedLinearError = 0.001 / solverScale;
    this.world.integrationParameters.normalizedPredictionDistance = 0.005 / solverScale;
    if (
      freeFlight ||
      reference.id === 'moon' ||
      !this.physicsOrigin ||
      this.physicsOrigin.distanceTo(this.pos) > 1000
    )
      this.physicsOrigin = this.pos.clone();
    const origin = this.physicsOrigin;
    this.world.gravity = freeFlight
      ? {x: 0, y: 0, z: 0}
      : gravity(startCOM).add(rotatingFrameCorrection(startCOM, relativeVelocity, startTime, reference));
    const coast = !freeFlight && reference.id === 'planet' ? shoreline(this.pos, startTime) : null;
    const nearShore = !!coast && Math.abs(coast.distance) <= craftRadius;
    const waterAt = (point: T.Vector3) =>
      nearShore ? overWater(point, startTime, reference) : !!coast && coast.distance < 0;
    const waterClearance = (p: FlightPart, time: number) => {
      const point = partCenter(p).applyQuaternion(this.q).add(this.pos),
        radial = bodyUp(point, time, reference),
        level = new T.Quaternion().setFromUnitVectors(radial, up).multiply(this.q);
      return bodyAltitude(point, time, reference) - extentY(p, level);
    };
    // Track entry before water forces slow the body. Already submerged parts
    // must not register another impact when diving or launching underwater.
    const waterEntries =
      this.failureDynamics || !coast || coast.distance > craftRadius
        ? []
        : this.parts.flatMap(p => {
            const point = partCenter(p).applyQuaternion(this.q).add(this.pos),
              velocity = relativeVelocity
                .clone()
                .add(relativeOmega.clone().cross(point.clone().sub(startCOM))),
              speed = -velocity.dot(localUp(point));
            return speed > 9 && waterAt(point) && waterClearance(p, startTime) > 0 ? [{p, speed}] : [];
          });
    if (this.ground) {
      const enabled = !freeFlight && (!coast || coast.distance >= -craftRadius);
      this.ground.setEnabled(enabled);
      if (enabled) {
        const center = this.pos
          .clone()
          .sub(origin)
          .addScaledVector(normal, -height - 1);
        const rotation = new T.Quaternion().setFromUnitVectors(up, normal);
        if (coast && coast.distance < craftRadius) {
          // Put the near edge of the 4 km ground box at the coastline.
          center.addScaledVector(coast.inland, 2000 - coast.distance);
          rotation.setFromRotationMatrix(
            new T.Matrix4().makeBasis(coast.inland, normal, coast.inland.clone().cross(normal))
          );
        }
        this.ground.setTranslation(center);
        this.ground.setRotation(rotation);
      }
    }
    this.body.setTranslation(this.pos.clone().sub(origin), true);
    this.body.setRotation(this.q, true);
    this.body.setLinvel(freeFlight ? {x: 0, y: 0, z: 0} : relativeVelocity, true);
    this.body.setAngvel(freeFlight ? this.omega : relativeOmega, true);
    this.updateColliderMasses();
    const st = this.vesselStats();
    this.stats = st;
    const mass = st.mass,
      com = st.com.clone().applyQuaternion(this.q).add(this.pos),
      air = reference.id === 'planet' ? atmosphere(height) : {density: 0, pressure: 0, temperature: 3},
      density = air.density;
    this.body.resetForces(true);
    this.body.resetTorques(true);
    const force = new T.Vector3(),
      torque = new T.Vector3(),
      engineForce = new T.Vector3();
    const apply = (f: T.Vector3, point: T.Vector3) => {
      force.add(f);
      torque.add(point.clone().sub(com).cross(f));
      this.body.addForceAtPoint(f, point.clone().sub(origin), true);
    };
    const commands = attitudeCommands(input, this.rocketAxes);
    const controlRotation = this.instrumentRotation;
    const steering = new T.Vector3(commands.pitch, commands.yaw, commands.roll).applyQuaternion(
      controlRotation
    );
    // Aircraft guidance already works in assembly coordinates. Only replace axes it owns.
    const guided = input.assemblyAttitude;
    if (guided) {
      const scale = input.precision ? 0.25 : 1;
      if (guided.pitch !== undefined) steering.x = guided.pitch * scale;
      if (guided.yaw !== undefined) steering.y = guided.yaw * scale;
      if (guided.roll !== undefined) steering.z = guided.roll * scale;
    }
    commands.pitch = steering.x;
    commands.yaw = steering.y;
    commands.roll = steering.z;
    const manual = steering.lengthSq() > 0.0001;
    if (!this.holdQ || !this.sas || (manual && (this.rocketAxes || this.sasMode !== 'hold')))
      this.holdQ = this.q.clone();
    else if (manual) this.holdQ = manualAttitudeTarget(this.q, this.holdQ, steering);
    if (manual) this.sasMode = 'hold';
    if (this.sas && this.sasMode !== 'hold') {
      const guide = this.dockingPorts
        ? portGuidance(this, this.dockingPorts.own, navigationTarget, this.dockingPorts.target)
        : null;
      const target =
          this.sasMode === 'dock'
            ? guide?.desiredNormal
            : this.sasMode === 'target'
              ? relativeState(this, navigationTarget)?.direction
              : this.sasMode === 'relativeRetrograde'
                ? relativeState(this, navigationTarget)?.braking
                : this.sasMode === 'maneuver'
                  ? maneuverDirection(this.maneuver)
                  : navDirection(navDirections(com, this.vel, startTime, this.navigationFrame), this.sasMode),
        forward =
          this.sasMode === 'dock' && guide
            ? new T.Vector3(0, 1, 0).applyQuaternion(partRotation(guide.own.part))
            : instrumentForward(this.rocketAxes, controlRotation);
      if (target) {
        const held = attitudeTarget(this.q, forward, target);
        if (held) this.holdQ = held;
      }
    }
    const banking =
      this.sas &&
      this.sasMode === 'hold' &&
      !this.rocketAxes &&
      st.aero.area > 0 &&
      !this.telemetry.groundContact &&
      (density * relativeVelocity.lengthSq()) / 2 > 50 &&
      Math.abs(new T.Vector3(1, 0, 0).applyQuaternion(this.q).dot(normal)) > Math.sin((5 * Math.PI) / 180);
    if (banking) this.holdQ = followBankHeading(this.q, this.holdQ, normal);
    if (this.sas) {
      const error = this.holdQ.clone().multiply(this.q.clone().invert());
      if (error.w < 0) {
        error.x *= -1;
        error.y *= -1;
        error.z *= -1;
      }
      const inverse = this.q.clone().invert(),
        localError = new T.Vector3(error.x, error.y, error.z).applyQuaternion(inverse),
        correction = new T.Vector3(error.x, error.y, error.z)
          .multiplyScalar(4)
          .addScaledVector(freeFlight ? this.omega : relativeOmega, -1.5)
          .applyQuaternion(inverse);
      const trimmed = (name: 'pitch' | 'yaw' | 'roll', axis: 'x' | 'y' | 'z'): boolean =>
        !this.rocketAxes &&
        Math.abs(steering[axis]) < 0.01 &&
        this.parts.some(
          p => PARTS[p.type].controlAxis && Math.abs(controlDeflection(p, st.com, {[name]: 1})) > 1e-6
        );
      const axes: SasTrimAxes = {x: trimmed('pitch', 'x'), y: trimmed('yaw', 'y'), z: trimmed('roll', 'z')};
      if (banking) axes.y = false;
      const bias = sasTrim(
        this,
        localError,
        correction.clone().add(new T.Vector3(this.trim, 0, 0)),
        axes,
        dt,
        !this.rocketAxes && !this.telemetry.groundContact && (density * relativeVelocity.lengthSq()) / 2 > 50
      );
      correction.add(bias);
      for (const [name, axis] of [
        ['pitch', 'x'],
        ['yaw', 'y'],
        ['roll', 'z']
      ] as const)
        commands[name] = T.MathUtils.clamp(commands[name] + correction[axis], -1, 1);
    } else sasTrim(this, null, null, null, dt, false);
    commands.pitch = T.MathUtils.clamp(commands.pitch + this.trim, -1, 1);
    this.engineThrust = engineBurn(
      this.networks,
      this.fuel,
      this.started ? this.active : new Set(),
      this.throttle,
      density,
      dt,
      air.pressure,
      p => 1 - engineSubmersion(this, p, startTime)
    );
    const wheelContacts: WheelContact[] = [];
    let stallCount = 0,
      contacts = 0,
      wheelImpactSpeed = 0;
    this.lastThrust = 0;
    // Every surface feels water for the part of it that is submerged (BACKLOG 9b): fins, rudders and wings
    // alike, with the flow relative to the water at rest on the surface.
    const surfaceSubmersion = (p: FlightPart, point: T.Vector3) =>
      waterAt(point) ? submergedFraction(altitude(point), extentY(p, this.q)) : 0;
    // Retracted gear neither touches the ground nor shares the load (BACKLOG 9c).
    const onWheels = (p: FlightPart) => !!PARTS[p.type].wheel && !gearRetracted(p, this.gearDeployed),
      wheelCount = this.parts.filter(onWheels).length,
      surfaces = this.parts.filter(p => PARTS[p.type].wing),
      submergedSurfaces = surfaces.filter(
        p => surfaceSubmersion(p, aeroPoint(p).applyQuaternion(this.q).add(this.pos)) > 0
      ).length,
      // Surfaces sharing the stability limit: those in water when any is, otherwise all of them.
      surfaceShare = submergedSurfaces || surfaces.length;
    // Craft inertia in the world frame, read once per step from the solver for the surface force limit.
    let principal: {inertia: T.Vector3; toPrincipal: T.Quaternion} | null = null;
    const inverseEffectiveMass = (point: T.Vector3, direction: T.Vector3): number => {
      if (!principal) {
        const i = this.body.principalInertia(),
          f = this.body.principalInertiaLocalFrame();
        principal = {
          inertia: new T.Vector3(i.x, i.y, i.z),
          toPrincipal: this.q
            .clone()
            .multiply(new T.Quaternion(f.x, f.y, f.z, f.w))
            .invert()
        };
      }
      const w = point.clone().sub(com).cross(direction).applyQuaternion(principal.toPrincipal),
        inertia = principal.inertia,
        turn = (a: number, b: number) => (b > 1e-9 ? (a * a) / b : 0);
      return 1 / mass + turn(w.x, inertia.x) + turn(w.y, inertia.y) + turn(w.z, inertia.z);
    };
    for (const p of this.parts) {
      const d = PARTS[p.type],
        orientation = this.q.clone().multiply(partRotation(p)),
        wp = partCenter(p).applyQuaternion(this.q).add(this.pos),
        r = wp.clone().sub(com),
        pv = relativeVelocity.clone().add(relativeOmega.clone().cross(r));
      if (d.gimbal) {
        const localIntent = new T.Vector3(commands.pitch, commands.yaw, commands.roll).applyQuaternion(
            partRotation(p).invert()
          ),
          lever = partCenter(p)
            .sub(st.com)
            .dot(up.clone().applyQuaternion(partRotation(p))),
          max = (d.gimbal * Math.PI) / 180;
        const target = new T.Vector3(localIntent.x, 0, localIntent.z).multiplyScalar(
          Math.sign(lever) * max * (p.gimbalEnabled === false ? 0 : 1)
        );
        if (target.length() > max) target.setLength(max);
        const current = this.gimbals.get(p.id) || new T.Vector3();
        const delta = target.sub(current);
        if (delta.length() > dt * 1.2) delta.setLength(dt * 1.2);
        current.add(delta);
        this.gimbals.set(p.id, current);
      }
      if (
        this.started &&
        d.thrust &&
        this.active.has(p.id) &&
        (d.thrustMedium === 'water' || (this.engineThrust.get(p.id) ?? 0) > 0)
      ) {
        let f =
          d.thrustMedium === 'water' ? engineMaxThrust(p) * this.throttle : this.engineThrust.get(p.id) || 0;
        if (d.thrustMedium === 'water') {
          f *= engineSubmersion(this, p, startTime);
          this.engineThrust.set(p.id, f);
        }
        const g = this.gimbals.get(p.id),
          gq = g ? new T.Quaternion().setFromEuler(new T.Euler(g.x, 0, g.z)) : new T.Quaternion();
        const point = d.gimbal
          ? new T.Vector3()
              .fromArray(d.gimbalPivot ?? missing('ジンバル支点', p.type))
              .applyQuaternion(orientation)
              .add(wp)
          : wp;
        const thrustVector = up.clone().applyQuaternion(gq).applyQuaternion(orientation).multiplyScalar(f);
        engineForce.add(thrustVector);
        apply(thrustVector, point);
        this.lastThrust += f;
      }
      if (d.parachute) {
        const state = this.chutes.get(p.id) ?? missing('パラシュート状態', p.id);
        parachuteStep(
          state,
          {
            altitude: height,
            speed: relativeVelocity.length(),
            vertical: relativeVelocity.dot(normal),
            density,
            landed: this.landed
          },
          dt
        );
        apply(parachuteDrag(pv, density, d.parachute, state.fraction, mass, dt), wp);
      }
      if (d.wing) {
        let angle = this.deflections.get(p.id) || 0,
          target = controlDeflection(p, st.com, commands);
        angle += T.MathUtils.clamp(target - angle, -dt * 1.6, dt * 1.6);
        this.deflections.set(p.id, angle);
        const point = aeroPoint(p).applyQuaternion(this.q).add(this.pos),
          velocity = relativeVelocity.clone().add(relativeOmega.clone().cross(point.clone().sub(com))),
          medium = mediumDensity(density, surfaceSubmersion(p, point)),
          aero = surfaceForce(p, orientation, velocity, medium, angle);
        if (aero.force.lengthSq() > 0)
          aero.force.multiplyScalar(
            surfaceForceScale(
              medium,
              velocity.length(),
              d.wing,
              inverseEffectiveMass(point, new T.Vector3(0, 0, 1).applyQuaternion(orientation)),
              dt,
              surfaceShare
            )
          );
        apply(aero.force, point);
        if (!this.failureDynamics && p.parent && aero.force.length() > d.wing * (d.breakPressure ?? 60000)) {
          failedParts.add(p.id);
          recordFailure(this, p, 'structural', {speed: velocity.length(), position: point});
        }
        if (density > 1e-8 && aero.stalled && velocity.length() > 5) stallCount++;
      }
      if (coast && coast.distance <= craftRadius) {
        const volume = displacedVolume(p);
        for (const u of [-0.32, 0.32]) {
          const point = new T.Vector3(0, d.size[1] * u, 0).applyQuaternion(orientation).add(wp),
            velocity = relativeVelocity.clone().add(relativeOmega.clone().cross(point.clone().sub(com))),
            sub = surfaceSubmersion(p, point);
          if (!sub) continue;
          apply(
            localUp(point).multiplyScalar(gravity(point).length() * WATER_DENSITY * volume * 0.5 * sub),
            point
          );
          apply(waterResistance(p, orientation, velocity, sub), point);
        }
      }
      if (onWheels(p) && !waterAt(wp)) {
        const radius = d.size[1] / 2,
          steer =
            d.steer && this.steeringEnabled && p.steeringEnabled !== false
              ? ((input.yaw || 0) * 0.4) / (1 + relativeVelocity.lengthSq() / 9)
              : 0;
        const rollingDirection = new T.Vector3(Math.sin(steer), 0, Math.cos(steer)).applyQuaternion(this.q);
        const motion = this.wheelMotion.get(p.id) || {angle: 0, speed: 0, steer: 0};
        const bottom = altitude(wp) - radius;
        motion.extension = T.MathUtils.clamp(bottom, 0, 0.18);
        motion.steer = steer;
        motion.speed =
          bottom < 0.18
            ? pv.dot(rollingDirection) / radius
            : motion.speed * Math.exp(-dt * (this.brake ? 12 : 0.3));
        motion.angle = (motion.angle + motion.speed * dt) % (2 * Math.PI);
        this.wheelMotion.set(p.id, motion);
        if (bottom < 0.18) {
          contacts++;
          wheelImpactSpeed = Math.min(wheelImpactSpeed, pv.dot(normal));
          const share = mass / Math.max(1, wheelCount),
            spring = Math.max(0, (0.18 - bottom) * share * 150 - pv.dot(normal) * share * 12);
          apply(normal.clone().multiplyScalar(spring), wp);
          const forward = new T.Vector3(Math.sin(steer), 0, Math.cos(steer)).applyQuaternion(this.q);
          forward.addScaledVector(normal, -forward.dot(normal));
          forward.normalize();
          const side = normal.clone().cross(forward),
            load = Math.max(spring, share * gravity(wp).length() * 0.25),
            point = wp.clone().addScaledVector(normal, -radius);
          wheelContacts.push({
            id: p.id,
            point: point.toArray(),
            halfAxle: new T.Vector3(d.size[0] / 2, 0, 0).applyQuaternion(orientation).toArray(),
            time: startTime
          });
          apply(
            side.multiplyScalar(T.MathUtils.clamp(-pv.dot(side) * share * 6, -load * 0.8, load * 0.8)),
            point
          );
          apply(
            forward
              .clone()
              .multiplyScalar(
                T.MathUtils.clamp(
                  -pv.dot(forward) * share * (this.brake ? 8 : 0.012),
                  -load * 0.8,
                  load * 0.8
                )
              ),
            point
          );
          // Powered wheels drive whenever the brake is off, without the Space start (BACKLOG 9a);
          // without a drive input they follow the throttle only once started, as engines do.
          if (
            PARTS[p.type].poweredWheel === true &&
            this.driveEnabled &&
            p.driveEnabled !== false &&
            !this.brake
          ) {
            const drive = T.MathUtils.clamp(input.drive ?? (this.started ? this.throttle : 0), -1, 1);
            apply(
              forward.multiplyScalar(drive * share * 3 * Math.max(0, 1 - Math.abs(pv.dot(forward)) / 18)),
              wp
            );
          }
        }
      }
    }
    const thrusters = this.rcsEnabled
      ? rcsThrusters(this.parts, PARTS).filter(t => (this.fuel.get(t.id) || 0) > 0)
      : [];
    const rotation = new T.Vector3(commands.pitch, commands.yaw, commands.roll),
      translation = new T.Vector3(input.translateX || 0, input.translateY || 0, input.translateZ || 0);
    if (this.portTranslationEnabled && this.dockingPorts) {
      const guide = portGuidance(this, this.dockingPorts.own, navigationTarget, this.dockingPorts.target);
      translation.copy(
        portTranslation(guide, this.q, {
          forward: input.portForward || 0,
          right: input.portRight || 0,
          up: input.portUp || 0
        })
      );
    }
    const levels = mixRCS(thrusters, st.com, rotation, translation);
    this.rcsJets = burnRCS(thrusters, levels, this.fuel, dt);
    for (const jet of this.rcsJets)
      apply(
        jet.force.clone().applyQuaternion(this.q),
        jet.position.clone().applyQuaternion(this.q).add(this.pos)
      );
    // Body drag at COM; wing drag and lift above act at individual aerodynamic centers.
    const bodyAero = bodyDrag(this.bodyAerodynamics, this.q, relativeVelocity, density);
    apply(bodyAero.force, com);
    const reaction = this.parts.reduce(
      (s, p) => s + (p.reactionEnabled === false ? 0 : PARTS[p.type].reactionTorque || 0),
      0
    );
    const power = powerStep(
      this.parts,
      this.charge,
      com,
      this.q,
      commands,
      this.reactionEnabled,
      dt,
      startTime,
      observationDemand(this)
    );
    advanceObservations({...this, universalTime: startTime}, this.observations, power, dt);
    if (this.reactionEnabled && reaction)
      this.body.addTorque(
        new T.Vector3(commands.pitch, commands.yaw, commands.roll)
          .multiplyScalar(reaction * power.ratio)
          .applyQuaternion(this.q),
        true
      );

    advanceTransferGuide(
      this.transferGuide,
      engineForce,
      this.vel.clone().sub(startBody.velocity),
      mass,
      dt,
      startTime
    );
    const maneuverWasComplete = this.maneuver?.complete;
    advanceManeuver(this.maneuver, engineForce.clone().multiplyScalar(dt / mass));
    if (!maneuverWasComplete && this.maneuver?.complete && this.maneuver.stopAtTarget === true)
      this.throttle = 0;
    const thermal = thermalStep(this.parts, this.thermal, this.q, relativeVelocity, air, dt);
    this.telemetry = {
      thermal,
      force,
      torque,
      engineForce,
      power,
      stallCount,
      contacts,
      wheelContacts,
      wheelImpactSpeed,
      commands,
      engine: 'Rust Rapier 0.21'
    };
    const impactSpeed = relativeVelocity.dot(normal);
    this.world.timestep = dt;
    this.world.step();
    this.q.copy(this.body.rotation()).normalize();
    this.omega.copy(this.body.angvel());
    if (freeFlight) {
      const next = advanceCelestialOrbit(com, this.vel, force.clone().divideScalar(mass), dt, startTime);
      this.pos.copy(next.pos).sub(st.com.clone().applyQuaternion(this.q));
      this.vel.copy(next.vel);
    } else {
      const turn = surfaceOrientation(dt, reference);
      this.q.premultiply(turn).normalize();
      this.omega.applyQuaternion(turn).add(spin);
      this.pos
        .copy(origin)
        .add(this.body.translation())
        .sub(startBody.position)
        .applyQuaternion(turn)
        .add(endBody.position);
      const endCOM = this.pos.clone().add(st.com.clone().applyQuaternion(this.q));
      this.vel
        .copy(this.body.linvel())
        .applyQuaternion(turn)
        .add(surfaceVelocity(endCOM, this.universalTime, reference));
      if (this.holdQ) this.holdQ.premultiply(turn).normalize();
    }
    // A settled unpowered body stays at rest instead of acquiring solver jitter.
    // Manual/SAS/RCS commands and any produced thrust wake it immediately.
    if (
      resting &&
      this.lastThrust === 0 &&
      !this.rcsJets.length &&
      Object.values(commands).every(n => Math.abs(n) < 1e-6) &&
      !Object.values(input).some(n => typeof n === 'number' && n !== 0)
    ) {
      this.pos.copy(resting.pos);
      this.q.copy(resting.q);
      const c = this.pos.clone().add(st.com.clone().applyQuaternion(this.q));
      this.vel.copy(surfaceVelocity(c, this.universalTime, reference));
      this.omega.copy(spin);
    }
    this.orbit = bodyOrbitState(
      this.pos.clone().add(st.com.clone().applyQuaternion(this.q)),
      this.vel,
      this.universalTime
    );
    for (const {p, speed} of waterEntries) {
      const point = partCenter(p).applyQuaternion(this.q).add(this.pos);
      if (overWater(point, this.universalTime, reference) && waterClearance(p, this.universalTime) <= 0) {
        failedParts.add(p.id);
        recordFailure(this, p, 'impact', {speed, position: point});
        this.crashed = true;
      }
    }
    const endRelativeVelocity = surfaceRelativeVelocity(
      this.pos.clone().add(st.com.clone().applyQuaternion(this.q)),
      this.vel,
      this.universalTime,
      reference
    );
    this.telemetry.atmosphere = air;
    this.telemetry.surfaceSpeed = endRelativeVelocity.length();
    const ground = this.ground,
      supported =
        !freeFlight &&
        ground &&
        [...this.colliderGroups.values()].flat().some(({collider: c}) => {
          let contact = false;
          this.world.contactPair(c, ground, m => {
            for (let i = 0; i < m.numContacts(); i++) if (m.contactImpulse(i) > 0) contact = true;
          });
          return contact;
        });
    // Suspension may absorb a hard touchdown over several solver steps.
    // Measure incoming contact-point speed before spring/solver impulses too.
    if (
      (!coast || coast.distance > craftRadius || supported || contacts > 0) &&
      !freeFlight &&
      (wheelImpactSpeed < -9 || (impactSpeed < -9 && endRelativeVelocity.dot(normal) > impactSpeed * 0.4))
    ) {
      this.crashed = true;
      const candidates = this.parts.map(p => {
        const point = partCenter(p).applyQuaternion(this.q).add(this.pos),
          rotation = this.q.clone().multiply(partRotation(p)),
          localNormal = normal.clone().applyQuaternion(rotation.invert()),
          size = PARTS[p.type].size;
        const clearance =
          bodyAltitude(point, this.universalTime, reference) -
          (Math.abs(localNormal.x) * size[0] +
            Math.abs(localNormal.y) * size[1] +
            Math.abs(localNormal.z) * size[2]) /
            2;
        let impulse = 0;
        if (this.ground)
          for (const {collider} of this.colliderGroups.get(p.id) ?? missing('部品のコライダー', p.id))
            this.world.contactPair(collider, this.ground, m => {
              for (let i = 0; i < m.numContacts(); i++) impulse += m.contactImpulse(i);
            });
        return {p, point, clearance, impulse};
      });
      candidates.sort((a, b) => b.impulse - a.impulse || a.clearance - b.clearance);
      const hit = candidates[0];
      failedParts.add(hit.p.id);
      recordFailure(this, hit.p, 'impact', {
        speed: Math.max(-wheelImpactSpeed, -impactSpeed, 0),
        position: hit.point
      });
    }
    const touching =
      !freeFlight &&
      this.parts.some(p => {
        const point = partCenter(p).applyQuaternion(this.q).add(this.pos),
          axes = new T.Matrix4().makeRotationFromQuaternion(
            this.q.clone().multiply(partRotation(p))
          ).elements,
          d = PARTS[p.type],
          extent =
            (Math.abs(normal.x * axes[0] + normal.y * axes[1] + normal.z * axes[2]) * d.size[0] +
              Math.abs(normal.x * axes[4] + normal.y * axes[5] + normal.z * axes[6]) * d.size[1] +
              Math.abs(normal.x * axes[8] + normal.y * axes[9] + normal.z * axes[10]) * d.size[2]) /
            2;
        return (
          !overWater(point, this.universalTime, reference) &&
          bodyAltitude(point, this.universalTime, reference) - extent < 0.1
        );
      });
    this.telemetry.groundContact = touching || supported || contacts > 0;
    this.landedTime =
      (touching || supported || contacts > 0) && endRelativeVelocity.length() < 0.8 && this.lastThrust === 0
        ? this.landedTime + dt
        : 0;
    this.landed = this.landedTime > 0.5;
    if (thermal.failed.length) {
      for (const id of thermal.failed) {
        failedParts.add(id);
        const p = this.parts.find(p => p.id === id) ?? missing('故障した部品', id);
        recordFailure(this, p, 'thermal', {position: partCenter(p).applyQuaternion(this.q).add(this.pos)});
      }
      this.crashed = true;
      this.throttle = 0;
    }
    this.maxAltitude = Math.max(this.maxAltitude, bodyAltitude(this.pos, this.universalTime) - this.floor);
    if (failedParts.size && !this.failureDynamics)
      fractureVessel(
        this,
        [...failedParts],
        (parts, environment, time) => new Flight(parts, environment, time),
        statistics
      );
  }
}
