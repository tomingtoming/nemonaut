// Symmetric placement: the poses, parents and saved frames of the copies placed with one click, and the
// parts made from them. The copies are arranged either around the bay's central axis ('vessel') or around
// the part being attached to ('parent'). Pure; workshop-place.ts shows the copies as ghosts and commits them.
import * as T from 'three';
import {PARTS, nodes, nodeAxis, type PartType, type PartAttachment} from './catalog.js';
import type {FlightPart} from './core.js';
import {bindMatchingNode, assertNodeAttachments} from './attachment-nodes.js';
import {symmetryPlacementPoses, type PlacementPose} from './placement-poses.js';
import {placementSymmetryFrame, symmetryTargets, hasSymmetryGeometry} from './symmetry.js';

export type SymmetryAxisMode = 'vessel' | 'parent';
export const PART_LIMIT = 400;
/** One placed copy: its pose, the part it attaches to and its saved symmetry frame. */
export interface SymmetryCopy extends PlacementPose {
  parent: string | null;
  frame: T.Matrix4Tuple;
}
export interface SymmetryAxis {
  origin: T.Vector3;
  direction: T.Vector3;
}
/** The first pose of a placement, as picked under the pointer. */
export interface PlacementSource extends PlacementPose {
  parent: string | null;
  attachment: PartAttachment;
}
type PosedPart = Pick<FlightPart, 'type' | 'p' | 'r'>;
const POSITION_TOLERANCE = 1e-5,
  ANGLE_TOLERANCE = 1e-4;
const partQuaternion = (p: Pick<FlightPart, 'r'>): T.Quaternion =>
  new T.Quaternion().setFromEuler(new T.Euler(...p.r));

/**
 * The axis symmetry copies are arranged around on a parent: the line through the part's datum along the
 * outward direction of its first attachment node. That is local +Y for every stack part and every part
 * with the default node box (tanks, engines, wheels, frames), and the span (local X) for wings and fins,
 * whose declared nodes are at the root and the tip. A part without nodes uses local +Y.
 */
export function parentSymmetryAxis(parent: PosedPart): SymmetryAxis {
  const first = nodes(parent.type)[0],
    local = first ? new T.Vector3(...nodeAxis(first)) : new T.Vector3(0, 1, 0);
  if (local.lengthSq() < 1e-12) local.set(0, 1, 0);
  return {
    origin: new T.Vector3(...parent.p),
    direction: local.normalize().applyQuaternion(partQuaternion(parent))
  };
}
/**
 * Normal of the parent-mode mirror plane, which always contains the parent's axis: the bay's left/right
 * direction (X) made perpendicular to the axis, so the pair comes out left and right of the parent. When
 * the axis itself points left/right the plane through it and the bay's own symmetry axis is used instead.
 */
export function parentMirrorNormal(direction: T.Vector3, bay: string): T.Vector3 {
  const normal = new T.Vector3(1, 0, 0).addScaledVector(direction, -direction.x);
  if (normal.lengthSq() > 1e-6) return normal.normalize();
  return (bay === 'vab' ? new T.Vector3(0, 1, 0) : new T.Vector3(0, 0, 1)).cross(direction).normalize();
}
function about(origin: T.Vector3, linear: T.Matrix4): T.Matrix4 {
  return new T.Matrix4()
    .makeTranslation(origin.x, origin.y, origin.z)
    .multiply(linear)
    .multiply(new T.Matrix4().makeTranslation(-origin.x, -origin.y, -origin.z));
}
/** Frames of the copies around one parent; the first is the identity (the picked pose itself). */
export function parentSymmetryFrames(parent: PosedPart, mode: string, bay: string): T.Matrix4[] {
  const count = mode === 'mirror' ? 2 : Number(mode);
  if (![1, 2, 3, 4, 6, 8].includes(count)) throw Error('対称数が不正です');
  const {origin, direction} = parentSymmetryAxis(parent);
  if (mode === 'mirror') {
    const {x, y, z} = parentMirrorNormal(direction, bay);
    return [
      new T.Matrix4(),
      about(
        origin,
        new T.Matrix4().set(
          1 - 2 * x * x,
          -2 * x * y,
          -2 * x * z,
          0,
          -2 * x * y,
          1 - 2 * y * y,
          -2 * y * z,
          0,
          -2 * x * z,
          -2 * y * z,
          1 - 2 * z * z,
          0,
          0,
          0,
          0,
          1
        )
      )
    ];
  }
  return Array.from({length: count}, (_, i) =>
    i
      ? about(origin, new T.Matrix4().makeRotationAxis(direction, (i * 2 * Math.PI) / count))
      : new T.Matrix4()
  );
}
/** A pose carried by a symmetry frame. A reflecting frame keeps the part right-handed, as mirror placement does. */
export function framePose(frame: T.Matrix4, pose: PlacementPose, type: string): PlacementPose {
  const pos = pose.pos.clone().applyMatrix4(frame),
    rotation = frame.clone().multiply(new T.Matrix4().makeRotationFromQuaternion(pose.q)),
    q = new T.Quaternion();
  if (frame.determinant() < 0) {
    q.setFromRotationMatrix(rotation.multiply(new T.Matrix4().makeScale(-1, 1, 1)));
    const mirror = PARTS[type]?.mirrorRotation;
    if (mirror) q.multiply(new T.Quaternion().setFromEuler(new T.Euler(...mirror)));
  } else q.setFromRotationMatrix(rotation);
  return {pos, q};
}
/**
 * The part and its symmetric counterparts with the frame that carries the part onto each (the part itself
 * first, with the identity). Group members without a saved frame, or moved away from where their frame puts
 * them by an individual edit, are not counterparts.
 */
export function symmetryCounterparts(
  parts: readonly FlightPart[],
  id: string
): {id: string; mapping: T.Matrix4}[] {
  const part = parts.find(p => p.id === id);
  if (!part) throw Error('部品が見つかりません');
  const own = [{id, mapping: new T.Matrix4()}];
  if (!part.symmetryFrame || !hasSymmetryGeometry(parts, id)) return own;
  const inverse = new T.Matrix4().fromArray(part.symmetryFrame).invert(),
    pose = {pos: new T.Vector3(...part.p), q: partQuaternion(part)};
  for (const member of symmetryTargets(parts, id)) {
    if (member.id === id || !member.symmetryFrame) continue;
    const mapping = new T.Matrix4().fromArray(member.symmetryFrame).multiply(inverse),
      expected = framePose(mapping, pose, part.type);
    if (
      expected.pos.distanceTo(new T.Vector3(...member.p)) < POSITION_TOLERANCE &&
      expected.q.angleTo(partQuaternion(member)) < ANGLE_TOLERANCE
    )
      own.push({id: member.id, mapping});
  }
  return own;
}
/**
 * Every copy of one symmetric placement, the picked pose first.
 * 'vessel': the copies turn about the bay's central axis (or mirror across its centre plane) and all name
 * the picked parent. 'parent': the copies turn about the parent's own axis (or mirror across the plane
 * through it), and the set is repeated on each symmetric counterpart of the parent, so N copies on a parent
 * with M counterparts give N×M parts in one group. Without a parent, or with symmetry off, 'parent' places
 * as 'vessel' does.
 */
export function symmetryCopies(
  parts: readonly FlightPart[],
  source: Pick<PlacementSource, 'pos' | 'q' | 'parent'>,
  mode: string,
  bay: string,
  type: string,
  axis: SymmetryAxisMode = 'vessel'
): SymmetryCopy[] {
  const count = mode === 'mirror' ? 2 : Number(mode),
    parent = axis === 'parent' && count > 1 ? parts.find(p => p.id === source.parent) : undefined;
  if (!parent)
    return symmetryPlacementPoses(source.pos, source.q, mode, bay, type).map((pose, i, all) => ({
      ...pose,
      parent: source.parent,
      frame: placementSymmetryFrame(mode, bay, i, all.length)
    }));
  const frames = parentSymmetryFrames(parent, mode, bay),
    first = {pos: source.pos, q: source.q},
    copies: SymmetryCopy[] = [];
  for (const target of symmetryCounterparts(parts, parent.id))
    for (const frame of frames)
      copies.push({
        ...framePose(target.mapping, framePose(frame, first, type), type),
        parent: target.id,
        frame: target.mapping.clone().multiply(frame).toArray()
      });
  return copies;
}
/**
 * The parts one symmetric placement adds (not yet in `parts`). Node-mounted copies each need a free,
 * matching node: on any part in 'vessel' mode, on their own parent in 'parent' mode. Throws without
 * placing anything when a copy has none, or when the copies would exceed the part limit.
 */
export function symmetricParts(
  parts: readonly FlightPart[],
  type: PartType,
  source: PlacementSource,
  mode: string,
  bay: string,
  axis: SymmetryAxisMode = 'vessel',
  makeId: () => string = () => crypto.randomUUID()
): FlightPart[] {
  const copies = symmetryCopies(parts, source, mode, bay, type, axis);
  if (parts.length + copies.length > PART_LIMIT) throw Error('部品上限は400です');
  let created: FlightPart[] = copies.map(({pos, q, parent}) => {
    const e = new T.Euler().setFromQuaternion(q);
    return {
      id: makeId(),
      type,
      p: pos.toArray(),
      r: [e.x, e.y, e.z],
      parent,
      stage: 0,
      attachment: structuredClone(source.attachment)
    };
  });
  if (source.attachment.mode === 'node') {
    const own = axis === 'parent' && copies.length > 1;
    created = created.map(p => bindMatchingNode(own ? parts.filter(q => q.id === p.parent) : parts, p));
    assertNodeAttachments(
      [...parts, ...created],
      created.map(p => p.id)
    );
  }
  if (created.length > 1) {
    const group = makeId();
    for (const [i, p] of created.entries()) {
      p.symmetryGroup = group;
      p.symmetryFrame = copies[i].frame;
    }
  }
  return created;
}
