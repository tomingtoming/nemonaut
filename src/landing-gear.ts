// Landing gear deploy / retract (BACKLOG 9c). Which parts fold away is a part property (`retractable` in the
// catalog: the aircraft nose and main gear and their large variants), never the craft type; the switch is one
// flag per vessel (Flight.gearDeployed, deployed at launch). Retracted gear has no wheel contact or suspension
// (core.ts), no drag (it leaves the body-drag boxes, body-drag.ts) and only a small collider at its centre
// (part-colliders.ts); deployed gear keeps the drag the body-drag model already gave it. Retracting is refused
// while the vessel touches the ground. No DOM, no import-time side effects.
import * as T from 'three';
import {PARTS} from './catalog.js';
import {angularMomentum, angularVelocity} from './angular-momentum.js';

/** Seconds for the gear visual to fold or unfold completely. */
export const GEAR_TRAVEL_TIME = 1;
/** A wheel's suspension reaches this far (core.ts): an extension below it means the tyre is on the ground. */
const SUSPENSION_TRAVEL = 0.18;
/** Starts that begin standing on the ground (the flight spawns there before its first step). */
const GROUND_STARTS: ReadonlySet<string> = new Set(['land', 'runway', 'moon-surface']);

/** Whether a part type is landing gear that folds away. */
export function isRetractable(type: string): boolean {
  return PARTS[type]?.retractable === true;
}
/** Whether a vessel has any gear the G key and the gear button act on. */
export function hasRetractableGear(parts: readonly {type: string}[]): boolean {
  return parts.some(p => isRetractable(p.type));
}
/** Whether this part is folded away now: retractable gear on a vessel whose gear is up. */
export function gearRetracted(part: {type: string}, deployed: boolean): boolean {
  return !deployed && isRetractable(part.type);
}

/** The vessel fields the ground check reads. */
export interface GearGroundVessel {
  parts: readonly {id: string; type: string}[];
  landed: boolean;
  time: number;
  environment: string;
  telemetry: {groundContact?: boolean};
  wheelMotion: ReadonlyMap<string, {extension?: number}>;
}
/**
 * Weight on the wheels or anything else on the ground: landed, a ground contact in the last step, a gear tyre
 * within its suspension travel, or a ground start that has not stepped yet.
 */
export function gearOnGround(v: GearGroundVessel): boolean {
  if (v.landed || v.telemetry.groundContact === true) return true;
  if (v.time === 0 && GROUND_STARTS.has(v.environment)) return true;
  return v.parts.some(p => {
    const extension = isRetractable(p.type) ? v.wheelMotion.get(p.id)?.extension : undefined;
    return extension !== undefined && extension < SUSPENSION_TRAVEL;
  });
}

/** The vessel fields setGear reads and changes. */
export interface GearVessel extends GearGroundVessel {
  gearDeployed: boolean;
  body: Parameters<typeof angularMomentum>[0];
  q: T.Quaternion;
  omega: T.Vector3;
  buildColliders(): void;
}
/** What a gear command did: nothing to move, no change, refused on the ground, or moved. */
export type GearResult = 'none' | 'unchanged' | 'refused' | 'deployed' | 'retracted';
/**
 * Puts the vessel's gear down (deployed true) or up. Retracting on the ground is refused (the craft would
 * drop onto its belly). A change rebuilds the colliders and the body drag, keeping the angular momentum as
 * the cargo door does (part-actions.ts).
 */
export function setGear(v: GearVessel, deployed: boolean): GearResult {
  if (!hasRetractableGear(v.parts)) return 'none';
  if (v.gearDeployed === deployed) return 'unchanged';
  if (!deployed && gearOnGround(v)) return 'refused';
  const momentum = angularMomentum(v.body, v.q, v.omega);
  v.gearDeployed = deployed;
  v.buildColliders();
  v.omega.copy(angularVelocity(v.body, v.q, momentum));
  return deployed ? 'deployed' : 'retracted';
}

/** The gear visual's position (1 down, 0 up) after dt seconds of travel toward the commanded state. */
export function gearTravel(position: number, deployed: boolean, dt: number): number {
  const target = deployed ? 1 : 0,
    step = Math.max(0, dt) / GEAR_TRAVEL_TIME;
  return Math.abs(target - position) <= step ? target : position + Math.sign(target - position) * step;
}
/** The fold of a gear visual at a position: swung back about its strut top by up to 90° and shrunk into the body. */
export function gearFold(position: number): {angle: number; scale: number} {
  const p = T.MathUtils.clamp(position, 0, 1),
    // Ease in and out so the leg starts and stops gently.
    eased = p * p * (3 - 2 * p);
  return {angle: (1 - eased) * (Math.PI / 2), scale: 0.35 + 0.65 * eased};
}
