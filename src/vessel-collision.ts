import * as T from 'three';
import RAPIER, {sharedPhysics, type Collider} from './physics.js';
import {PARTS} from './catalog.js';
import {partMass, partRotation} from './aero.js';
import {inertiaAbout} from './vessel-inertia.js';
import {DOCK_LIMITS} from './docking-limits.js';
import {centerOfVessel} from './relative-navigation.js';
import {recordFailure} from './failure-events.js';
import type {Flight, FlightPart} from './core.js';

/** One resolved vessel-vessel contact pass (VESSEL_COLLISION.onContact receives it). */
export interface VesselContactEvent {
  a: string;
  b: string;
  contacts: number;
  speed: number;
}
/** A collider of a vessel in the pair query: its owning part and the engine's shape arguments. */
interface ContactShape {
  part: FlightPart | undefined;
  args: [number, number, number, number, number, number, number, number, number, number, number];
}
/** A contact point between two vessels (world position, normal from a to b, signed gap). */
interface VesselContact {
  point: T.Vector3;
  normal: T.Vector3;
  distance: number;
  parts: [FlightPart | undefined, FlightPart | undefined];
}
/** A vessel as a rigid body for impulse resolution. */
interface CollisionBody {
  v: Flight;
  mass: number;
  center: T.Vector3;
  inverseInertia: T.Matrix3;
}

// Vessel-vessel collision after every vessel has stepped in its own world. Rust (parry) finds
// the contacts; this pass applies equal and opposite impulses to the game state, which is
// what the next step imports. Momentum is conserved; restitution is 0 like the colliders.
// onContact(event) observes resolved vessel contacts (tests, diagnostics); null by default.
/** Tunables of the vessel-vessel pass; tests swap onContact and enabled. */
export interface VesselCollisionSettings {
  enabled: boolean;
  onContact: ((event: VesselContactEvent) => void) | null;
  prediction: number;
  slop: number;
  correction: number;
  friction: number;
  iterations: number;
  impactSpeed: number;
}
export const VESSEL_COLLISION: VesselCollisionSettings = {
  enabled: true,
  onContact: null,
  prediction: 0.05,
  slop: 0.005,
  correction: 0.8,
  friction: 0.5,
  iterations: 4,
  impactSpeed: 9
};
// Pairs that were already touching when first seen (fresh stages, fracture fragments, restored
// saves) do not collide until they have separated once.
const ignored = new Map<string, boolean>();
const key = (a: Flight, b: Flight) =>
  a.vesselId < b.vesselId ? a.vesselId + '|' + b.vesselId : b.vesselId + '|' + a.vesselId;
// A rebuilt part gets a new Collider. Pose and mass of the vessel can change independently.
const shapeArgs = new WeakMap<Collider, ContactShape['args']>();
function contactArgs(c: Collider): ContactShape['args'] {
  const cached = shapeArgs.get(c);
  if (cached) return cached;
  const p = c.translationWrtParent(),
    q = c.rotationWrtParent(),
    kind = c.shapeType(),
    ball = kind === RAPIER.ShapeType.Ball;
  if (!ball && kind !== RAPIER.ShapeType.Cuboid)
    throw Error('Rust物理: unsupported collider for vessel contact');
  const h = ball ? {x: c.radius(), y: 0, z: 0} : c.halfExtents();
  const args: ContactShape['args'] = [ball ? 1 : 0, h.x, h.y, h.z, p.x, p.y, p.z, q.x, q.y, q.z, q.w];
  shapeArgs.set(c, args);
  return args;
}
function shapes(v: Flight): ContactShape[] {
  const owner = new Map<number, string>();
  for (const [id, group] of v.colliderGroups) for (const {collider} of group) owner.set(collider.handle, id);
  const out: ContactShape[] = [];
  for (let i = 0; i < v.body.numColliders(); i++) {
    const c = v.body.collider(i);
    out.push({part: v.parts.find(x => x.id === owner.get(c.handle)), args: contactArgs(c)});
  }
  return out;
}
// Facing docking ports belong to the docking capture, not to collision.
function dockingFaces(a: Flight, pa: FlightPart | undefined, b: Flight, pb: FlightPart | undefined): boolean {
  if (!pa || !pb || !PARTS[pa.type]?.docking || !PARTS[pb.type]?.docking) return false;
  const up = (v: Flight, p: FlightPart) =>
    new T.Vector3(0, 1, 0).applyQuaternion(v.q.clone().multiply(partRotation(p)));
  return Math.acos(T.MathUtils.clamp(-up(a, pa).dot(up(b, pb)), -1, 1)) <= 2 * DOCK_LIMITS.angle;
}
function body(v: Flight): CollisionBody {
  const mass = v.parts.reduce((s, p) => s + partMass(p, v.fuel, v.ballast, v.thermal), 0),
    center = centerOfVessel(v);
  return {v, mass, center, inverseInertia: inertiaAbout(v, center).invert()};
}
const velocityAt = (b: CollisionBody, r: T.Vector3) => b.v.vel.clone().add(b.v.omega.clone().cross(r));
function applyImpulse(b: CollisionBody, r: T.Vector3, impulse: T.Vector3, sign: number): void {
  b.v.vel.addScaledVector(impulse, sign / b.mass);
  b.v.omega.add(r.clone().cross(impulse).applyMatrix3(b.inverseInertia).multiplyScalar(sign));
}
function effectiveMass(
  A: CollisionBody,
  B: CollisionBody,
  rA: T.Vector3,
  rB: T.Vector3,
  n: T.Vector3
): number {
  const term = (b: CollisionBody, r: T.Vector3) =>
    r.clone().cross(n).applyMatrix3(b.inverseInertia).cross(r).dot(n);
  return 1 / A.mass + 1 / B.mass + term(A, rA) + term(B, rB);
}
// Speculative contacts: within the prediction distance, the approach that just closes the gap
// during this step (distance/dt) is allowed, so vessels touch instead of stopping early.
export function resolveVesselCollisions(vessels: readonly Flight[], dt: number): VesselContactEvent[] {
  if (!(dt > 0)) throw Error('vessel collision needs the step dt');
  if (!VESSEL_COLLISION.enabled) return [];
  const pair = sharedPhysics();
  if (!pair) return []; // the engine failed to load (worlds then fail too)
  const events: VesselContactEvent[] = [],
    live = vessels.filter(v => v.body && v.parts.length),
    seen = new Set<string>();
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i],
        b = live[j],
        k = key(a, b);
      if (
        a.pos.distanceTo(b.pos) >
        a.world.collisionRadius() + b.world.collisionRadius() + VESSEL_COLLISION.prediction
      ) {
        ignored.delete(k);
        continue;
      }
      seen.add(k);
      const sa = shapes(a),
        sb = shapes(b),
        origin = a.pos.clone(),
        offset = b.pos.clone().sub(origin);
      pair.pair_reset();
      for (const s of sa)
        if (pair.pair_shape(0, ...s.args) !== 1) throw Error('Rust物理: vessel contact shape rejected');
      for (const s of sb)
        if (pair.pair_shape(1, ...s.args) !== 1) throw Error('Rust物理: vessel contact shape rejected');
      if (
        pair.pair_pose(0, 0, 0, 0, a.q.x, a.q.y, a.q.z, a.q.w) !== 1 ||
        pair.pair_pose(1, offset.x, offset.y, offset.z, b.q.x, b.q.y, b.q.z, b.q.w) !== 1
      )
        throw Error('Rust物理: vessel contact pose rejected');
      const count = pair.pair_query(VESSEL_COLLISION.prediction);
      if (!Number.isInteger(count)) throw Error('Rust物理: vessel contact query failed');
      const contacts: VesselContact[] = [];
      for (let c = 0; c < count; c++) {
        const read = (f: number) => pair.pair_read(c, f),
          pa = sa[read(7)].part,
          pb = sb[read(8)].part;
        if (dockingFaces(a, pa, b, pb)) continue;
        contacts.push({
          point: new T.Vector3(read(0), read(1), read(2)).add(origin),
          normal: new T.Vector3(read(3), read(4), read(5)).normalize(),
          distance: read(6),
          parts: [pa, pb]
        });
      }
      if (!ignored.has(k)) ignored.set(k, contacts.length > 0);
      if (!contacts.length) {
        ignored.set(k, false);
        continue;
      }
      if (ignored.get(k)) continue;
      const A = body(a),
        B = body(b);
      let impact: {speed: number; contact?: VesselContact} = {speed: 0};
      for (let pass = 0; pass < VESSEL_COLLISION.iterations; pass++)
        for (const c of contacts) {
          const rA = c.point.clone().sub(A.center),
            rB = c.point.clone().sub(B.center),
            n = c.normal;
          const relative = velocityAt(B, rB).sub(velocityAt(A, rA)),
            vn = relative.dot(n),
            closing = vn + Math.max(c.distance, 0) / dt;
          if (closing >= 0) continue;
          if (pass === 0 && -vn > impact.speed) impact = {speed: -vn, contact: c};
          const jn = -closing / effectiveMass(A, B, rA, rB, n),
            normalImpulse = n.clone().multiplyScalar(jn);
          applyImpulse(A, rA, normalImpulse, -1);
          applyImpulse(B, rB, normalImpulse, 1);
          const after = velocityAt(B, rB).sub(velocityAt(A, rA)),
            tangent = after.addScaledVector(n, -after.dot(n)),
            speed = tangent.length();
          if (speed > 1e-9) {
            const t = tangent.divideScalar(speed),
              jt = Math.min(speed / effectiveMass(A, B, rA, rB, t), VESSEL_COLLISION.friction * jn),
              frictionImpulse = t.multiplyScalar(-jt);
            applyImpulse(A, rA, frictionImpulse, -1);
            applyImpulse(B, rB, frictionImpulse, 1);
          }
        }
      const depth = Math.max(0, ...contacts.map(c => -c.distance - VESSEL_COLLISION.slop));
      if (depth > 0) {
        const n = contacts.reduce((m, c) => (c.distance < m.distance ? c : m)).normal,
          total = A.mass + B.mass,
          shift = depth * VESSEL_COLLISION.correction;
        a.pos.addScaledVector(n, (-shift * B.mass) / total);
        b.pos.addScaledVector(n, (shift * A.mass) / total);
      }
      if (!impact.contact && depth <= 0) continue; // within prediction range but not touching this step
      const event = {a: a.vesselId, b: b.vesselId, contacts: contacts.length, speed: impact.speed};
      events.push(event);
      VESSEL_COLLISION.onContact?.(event);
      const hit = impact.contact;
      if (hit && impact.speed > VESSEL_COLLISION.impactSpeed)
        for (const [v, p] of [
          [a, hit.parts[0]],
          [b, hit.parts[1]]
        ] as const) {
          if (!p || v.failureDynamics) continue;
          recordFailure(v, p, 'impact', {speed: impact.speed, position: hit.point.clone()});
          v.crashed = true;
          v.fractureParts([p.id]);
        }
    }
  for (const k of ignored.keys()) if (!seen.has(k)) ignored.delete(k);
  return events;
}
