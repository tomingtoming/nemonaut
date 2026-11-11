import {portPose} from './port-navigation.js';
export {portPose} from './port-navigation.js';
import * as T from 'three';
import {PARTS} from './catalog.js';
import {partRotation, partMass} from './aero.js';
import {resolveTargets} from './relative-navigation.js';
import {centerOfMass} from './center-of-mass.js';
import {Flight, statistics, descendants, validateCraft, type FlightPart} from './core.js';
import {fleet} from './fleet.js';
import {fuelNetworks} from './resources.js';
import {bodyOrbitState} from './celestial.js';
import {copyPartState} from './fracture.js';
import {inertiaAbout} from './vessel-inertia.js';
export {inertiaAbout} from './vessel-inertia.js';
import {DOCK_LIMITS} from './docking-limits.js';
export {DOCK_LIMITS} from './docking-limits.js';
/** Whether two ports may dock now; the measurements are present when both ports were found. */
export interface DockingStatus {
  ready: boolean;
  reason: string;
  distance?: number;
  angle?: number;
  speed?: number;
  angularSpeed?: number;
}
/** A vessel as a rigid body with motion (combinedMotion). */
export type DockingBody = import('./port-navigation.js').PortVessel &
  import('./vessel-inertia.js').InertiaVessel;
/** Total mass, centre, momentum and inertia of two vessels moving as one. */
export interface CombinedMotion {
  mass: number;
  center: T.Vector3;
  velocity: T.Vector3;
  omega: T.Vector3;
  momentum: T.Vector3;
  angularMomentum: T.Vector3;
  inertia: T.Matrix3;
}
export function dockingStatus(a: Flight, aId: string, b: Flight, bId: string): DockingStatus {
  const invalid = (reason: string) => ({ready: false, reason});
  if (a === b) return invalid('同じ機体です');
  if (a.crashed || b.crashed) return invalid('損傷した機体です');
  if (a.ballast !== b.ballast && [...a.parts, ...b.parts].some(p => PARTS[p.type].ballast))
    return invalid('結合前に両機のバラスト設定を合わせてください');
  const pa = portPose(a, aId),
    pb = portPose(b, bId);
  if (!pa || !pb) return invalid('ポートが見つかりません');
  if (pa.part.dockPartner || pb.part.dockPartner) return invalid('使用中のポートです');
  const distance = pa.position.distanceTo(pb.position),
    angle = Math.acos(T.MathUtils.clamp(-pa.normal.dot(pb.normal), -1, 1)),
    speed = pa.velocity.distanceTo(pb.velocity),
    angularSpeed = a.omega.distanceTo(b.omega);
  const reason =
    distance > DOCK_LIMITS.distance
      ? 'ポートが離れています'
      : angle > DOCK_LIMITS.angle
        ? '結合面が向き合っていません'
        : speed > DOCK_LIMITS.speed
          ? '接触点の相対速度が高すぎます'
          : angularSpeed > DOCK_LIMITS.angularSpeed
            ? '相対回転が速すぎます'
            : '';
  return {ready: !reason, reason, distance, angle, speed, angularSpeed};
}

export function combinedMotion(a: DockingBody, b: DockingBody): CombinedMotion {
  const vessels = [a, b],
    masses = vessels.map(v => v.parts.reduce((s, p) => s + partMass(p, v.fuel, v.ballast, v.thermal), 0)),
    centers = vessels.map(centerOfMass),
    mass = masses[0] + masses[1],
    center = centers[0]
      .clone()
      .multiplyScalar(masses[0])
      .addScaledVector(centers[1], masses[1])
      .divideScalar(mass),
    momentum = new T.Vector3(),
    angularMomentum = new T.Vector3(),
    inertia = new T.Matrix3().set(0, 0, 0, 0, 0, 0, 0, 0, 0);
  vessels.forEach((v, i) => {
    const linear = v.vel.clone().multiplyScalar(masses[i]);
    momentum.add(linear);
    angularMomentum
      .add(v.omega.clone().applyMatrix3(inertiaAbout(v, centers[i])))
      .add(centers[i].clone().sub(center).cross(linear));
    const tensor = inertiaAbout(v, center);
    tensor.elements.forEach((n, j) => (inertia.elements[j] += n));
  });
  return {
    mass,
    center,
    velocity: momentum.clone().divideScalar(mass),
    omega: angularMomentum.clone().applyMatrix3(inertia.clone().invert()),
    momentum,
    angularMomentum,
    inertia
  };
}

function rebuilt(source: Flight, parts: FlightPart[], sources: readonly Flight[] = [source]): Flight {
  validateCraft({version: 1, parts});
  const out = new Flight(parts, source.environment),
    ids = new Set(parts.map(p => p.id));
  out.transferGuide = null;
  out.vesselName = source.vesselName;
  out.time = source.time;
  out.universalTime = source.universalTime;
  out.stage = source.stage;
  out.started = source.started;
  out.ballast = source.ballast;
  out.trim = source.trim;
  out.brake = source.brake;
  out.gearDeployed = source.gearDeployed;
  out.flapStage = source.flapStage;
  out.reactionEnabled = source.reactionEnabled;
  out.steeringEnabled = source.steeringEnabled;
  out.driveEnabled = source.driveEnabled;
  out.rcsEnabled = source.rcsEnabled;
  out.maxAltitude = source.maxAltitude;
  out.pos.copy(source.pos);
  out.q.copy(source.q);
  out.vel.copy(source.vel);
  out.omega.copy(source.omega);
  out.holdQ = source.q.clone();
  out.sas = parts.some(p => PARTS[p.type].control) && source.sas;
  out.sasMode = 'hold';
  out.navigationFrame = source.navigationFrame;
  out.navigationAuto = source.navigationAuto;
  out.throttle = 0;
  out.maneuver = null;
  out.targetPartId = source.targetPartId;
  // A later separation must not reuse a name an earlier one already took.
  out.separationCount = Math.max(...sources.map(v => v.separationCount));
  out.orbitalAscentSettings = source.orbitalAscentSettings;
  out.cruiseSettings = source.cruiseSettings;
  out.runwayEnd = source.runwayEnd;
  // Every source's entries in order (a later duplicate id overwrites the value in place), kept for this vessel's parts.
  function merged<V>(pick: (v: Flight) => ReadonlyMap<string, V>): Map<string, V> {
    return copyPartState(new Map<string, V>(sources.flatMap(v => [...pick(v)])), ids);
  }
  out.fuel = merged(v => v.fuel);
  out.charge = merged(v => v.charge);
  out.thermal = merged(v => v.thermal);
  out.chutes = merged(v => v.chutes);
  out.deflections = merged(v => v.deflections);
  out.gimbals = merged(v => v.gimbals);
  out.wheelMotion = merged(v => v.wheelMotion);
  out.observations = merged(v => v.observations);
  out.active = new Set(sources.flatMap(v => [...v.active]).filter(id => ids.has(id)));
  out.networks = fuelNetworks(out.parts);
  out.stats = statistics(out.parts, out.fuel, out.ballast, out.thermal, out.gearDeployed);
  out.buildColliders();
  return out;
}
/** A part the docking edit must find (ports checked by dockingStatus, parents of a validated craft). */
function required(p: FlightPart | undefined, id: string): FlightPart {
  if (!p) throw Error('結合する部品が見つかりません: ' + id);
  return p;
}
function updateOrbit(v: Flight): void {
  v.orbit = bodyOrbitState(centerOfMass(v), v.vel, v.universalTime);
}
function replaceFleet(
  root: Flight,
  removed: readonly Flight[],
  replacement: Flight,
  extras: readonly Flight[] = []
): Flight {
  const others = fleet(root).filter(v => !removed.includes(v));
  for (const v of [...others, ...removed]) v.detached = [];
  replacement.detached = [...others, ...extras];
  resolveTargets(replacement);
  for (const v of removed) v.dispose();
  return replacement;
}

export function dockVessels(root: Flight, target: Flight, rootPort: string, targetPort: string): Flight {
  if (!fleet(root).includes(target)) throw Error('現在の飛行に含まれない機体です');
  const status = dockingStatus(root, rootPort, target, targetPort);
  if (!status.ready) throw Error(status.reason);
  if (root.parts.length + target.parts.length > 400) throw Error('結合後の部品数が上限を超えます');
  const parts = structuredClone(root.parts),
    incoming = structuredClone(target.parts),
    inverse = root.q.clone().invert(),
    relative = inverse.clone().multiply(target.q),
    offset = target.pos.clone().sub(root.pos).applyQuaternion(inverse),
    byId = new Map<string, FlightPart>(incoming.map(p => [p.id, p]));
  // Reverse the path from the incoming port to its old root, preserving every edge.
  let current = required(byId.get(targetPort), targetPort),
    parent = current.parent;
  current.parent = rootPort;
  while (parent) {
    const next = required(byId.get(parent), parent),
      previous = next.parent;
    next.parent = current.id;
    current = next;
    parent = previous;
  }
  for (const p of incoming) {
    p.p = new T.Vector3(...p.p).applyQuaternion(relative).add(offset).toArray();
    const e = new T.Euler().setFromQuaternion(relative.clone().multiply(partRotation(p)));
    p.r = [e.x, e.y, e.z];
  }
  for (const [v, list] of [
    [root, parts],
    [target, incoming]
  ] as const)
    for (const p of list)
      if (!p.missionOrigin) p.missionOrigin = {name: v.vesselName, epoch: v.universalTime - v.time};
  required(
    parts.find(p => p.id === rootPort),
    rootPort
  ).dockPartner = targetPort;
  required(byId.get(targetPort), targetPort).dockPartner = rootPort;
  parts.push(...incoming);
  const motion = combinedMotion(root, target),
    merged = rebuilt(root, parts, [root, target]);
  merged.vesselId = root.vesselId;
  merged.vel.copy(motion.velocity);
  merged.omega.copy(motion.omega);
  updateOrbit(merged);
  return replaceFleet(root, [root, target], merged);
}
export function undockVessel(root: Flight, portId: string): Flight {
  const port = root.parts.find(p => p.id === portId),
    partner = root.parts.find(p => p.id === port?.dockPartner);
  if (!port || !partner || partner.dockPartner !== port.id) throw Error('結合済みポートを選んでください');
  const childPort = port.parent === partner.id ? port : partner.parent === port.id ? partner : null;
  if (!childPort) throw Error('ポート間の接続が不正です');
  const ids = descendants(root.parts, childPort.id),
    parts = structuredClone(root.parts);
  for (const p of parts) {
    if (p.id === port.id || p.id === partner.id) delete p.dockPartner;
    if (p.id === childPort.id) p.parent = null;
  }
  const retained = parts.filter(p => !ids.has(p.id)),
    branch = parts.filter(p => ids.has(p.id)),
    before = centerOfMass(root),
    a = rebuilt(root, retained),
    b = rebuilt(root, branch);
  for (const v of [a, b]) {
    const origin = v.parts.find(p => p.missionOrigin)?.missionOrigin;
    if (origin) {
      v.vesselName = origin.name;
      v.time = Math.max(0, v.universalTime - origin.epoch);
    }
  }
  a.vesselId = root.vesselId;
  for (const v of [a, b]) v.vel.copy(root.vel).add(root.omega.clone().cross(centerOfMass(v).sub(before)));
  // Equal-and-opposite impulses through the COM line preserve total angular momentum.
  const direction = centerOfMass(b).sub(centerOfMass(a));
  if (direction.lengthSq() > 1e-10) {
    direction.normalize();
    const impulse = 0.1 / (1 / a.stats.mass + 1 / b.stats.mass);
    a.vel.addScaledVector(direction, -impulse / a.stats.mass);
    b.vel.addScaledVector(direction, impulse / b.stats.mass);
  }
  updateOrbit(a);
  updateOrbit(b);
  return replaceFleet(root, [root], a, [b]);
}
