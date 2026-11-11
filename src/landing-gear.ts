// Landing gear deploy / retract. Which parts fold away is a part property (`retractable` in the
// catalog: the aircraft nose and main gear and their large variants), never the craft type; the switch is one
// flag per vessel (Flight.gearDeployed, deployed at launch). Retracted gear has no wheel contact or suspension
// (core.ts) and no drag (it leaves the body-drag boxes, body-drag.ts); its mass and a small collider move to the
// folded wheel, where the visual puts it (foldedGearCenter): inside the fuselage on a craft whose gear hangs from
// a strut, so a gear-up landing rests on the belly. Statistics and the solver share that mass centre. Deployed
// gear keeps the drag the body-drag model already gave it. Retracting is refused while the vessel touches the
// ground. No DOM, no import-time side effects.
import * as T from 'three';
import {PARTS, type PartVector} from './catalog.js';
import {partCenter, partRotation} from './aero.js';
import {angularMomentum, angularVelocity} from './angular-momentum.js';

/** Seconds for the gear visual to fold or unfold completely. */
export const GEAR_TRAVEL_TIME = 1;
/** Maximum axle extension in metres for a wheel. */
export function suspensionTravel(type: string): number {
  const travel = PARTS[type].suspensionTravel;
  if (travel === undefined) throw Error('車輪のサスペンション長がありません: ' + type);
  return travel;
}
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
    return extension !== undefined && extension < suspensionTravel(p.type);
  });
}

/** The vessel fields setGear reads and changes. */
export interface GearVessel extends GearGroundVessel {
  gearDeployed: boolean;
  body: Parameters<typeof angularMomentum>[0];
  q: T.Quaternion;
  omega: T.Vector3;
  pos: T.Vector3;
  stats: {com: T.Vector3};
  buildColliders(): void;
  vesselStats(): {com: T.Vector3};
}
/** What a gear command did: nothing to move, no change, refused on the ground, or moved. */
export type GearResult = 'none' | 'unchanged' | 'refused' | 'deployed' | 'retracted';
/**
 * Puts the vessel's gear down (deployed true) or up. Retracting on the ground is refused (the craft would
 * drop onto its belly). A change rebuilds the colliders and the body drag, keeping the angular momentum as
 * the cargo door does (part-actions.ts); the folded gear's mass moves inside, so the craft shifts against
 * it and its centre of mass stays where it was in space, as a fuel transfer does (core.ts).
 */
export function setGear(v: GearVessel, deployed: boolean): GearResult {
  if (!hasRetractableGear(v.parts)) return 'none';
  if (v.gearDeployed === deployed) return 'unchanged';
  if (!deployed && gearOnGround(v)) return 'refused';
  const momentum = angularMomentum(v.body, v.q, v.omega),
    before = v.vesselStats().com;
  v.gearDeployed = deployed;
  v.buildColliders();
  v.stats = v.vesselStats();
  v.pos.add(before.sub(v.stats.com).applyQuaternion(v.q));
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

/** The part fields the folded gear position reads (a catalog Part satisfies it). */
export interface GearPart {
  id: string;
  type: string;
  p: PartVector;
  r: PartVector;
  parent?: string | null;
}
// The original 0.7 m wheels establish the proportions of the procedural support.
export function gearStrutScale(type: string): number {
  return PARTS[type].size[1] / 0.7;
}
/**
 * The top of the strut a wheel hangs from, in the craft frame: just under its parent's centre line, straight
 * above the wheel's fore-aft station. Null when the wheel has no parent or the strut would be too short or too
 * long to draw (the workshop and flight visuals then show no strut, part-visuals.ts).
 */
export function gearStrutTop(
  part: Pick<GearPart, 'p' | 'type'>,
  parent: Pick<GearPart, 'p'> | undefined
): T.Vector3 | null {
  if (!parent) return null;
  const scale = gearStrutScale(part.type),
    top = new T.Vector3(parent.p[0], parent.p[1] - 0.25 * scale, part.p[2]),
    length = top.distanceTo(new T.Vector3(...part.p));
  return length > 0.2 * scale && length < 3 * scale ? top : null;
}
/** The fold pivot of a gear visual in the part's own axes: the strut's top, or else the top of the wheel. */
export function gearFoldPivot(part: GearPart, parent: Pick<GearPart, 'p'> | undefined): T.Vector3 {
  const top = gearStrutTop(part, parent);
  return top
    ? top.sub(new T.Vector3(...part.p)).applyQuaternion(partRotation(part).invert())
    : new T.Vector3(0, PARTS[part.type].size[1] / 2, 0);
}
/** Where a part-frame point of the gear goes when the gear is fully up (gearFold(0) about gearFoldPivot). */
function foldedPoint(local: T.Vector3, pivot: T.Vector3): T.Vector3 {
  const {angle, scale} = gearFold(0);
  return local
    .clone()
    .sub(pivot)
    .multiplyScalar(scale)
    .applyAxisAngle(new T.Vector3(1, 0, 0), angle)
    .add(pivot);
}
/**
 * The mass centre of a folded gear part in the craft frame: where the visual draws the folded wheel. The
 * parent is looked up in the vessel's parts; a gear whose parent left (staging, fracture) folds about its
 * own wheel top.
 */
export function foldedGearCenter(part: GearPart, parts: readonly GearPart[]): T.Vector3 {
  const parent = parts.find(p => p.id === part.parent),
    rotation = partRotation(part),
    local = partCenter(part)
      .sub(new T.Vector3(...part.p))
      .applyQuaternion(rotation.clone().invert());
  return foldedPoint(local, gearFoldPivot(part, parent))
    .applyQuaternion(rotation)
    .add(new T.Vector3(...part.p));
}
/** The radius of a folded wheel's collider: the wheel shrunk as its visual is. */
export function foldedWheelRadius(type: string): number {
  return (PARTS[type].size[1] / 2) * gearFold(0).scale;
}
/** A part's mass centre in the craft frame with the vessel's gear up or down (statistics and colliders). */
export function gearMassCenter(part: GearPart, parts: readonly GearPart[], deployed: boolean): T.Vector3 {
  return gearRetracted(part, deployed) ? foldedGearCenter(part, parts) : partCenter(part);
}
