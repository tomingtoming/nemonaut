import * as T from 'three';
import {PARTS} from './catalog.js';
import {partRotation} from './aero.js';
import {centerOfVessel, type MovingVessel, type NavigationPart} from './relative-navigation.js';
export interface PortVessel<P extends NavigationPart = NavigationPart> extends MovingVessel {
  parts: readonly P[];
  omega: T.Vector3;
}
export interface PortPose<P extends NavigationPart = NavigationPart> {
  part: P;
  q: T.Quaternion;
  position: T.Vector3;
  normal: T.Vector3;
  velocity: T.Vector3;
}
export interface PortGuidance {
  own: PortPose;
  target: PortPose;
  right: T.Vector3;
  top: T.Vector3;
  outward: T.Vector3;
  axial: number;
  horizontal: number;
  vertical: number;
  lateral: number;
  closing: number;
  horizontalSpeed: number;
  verticalSpeed: number;
  speed: number;
  angle: number;
  desiredNormal: T.Vector3;
}
export interface PortTranslationInput {
  forward?: number;
  right?: number;
  up?: number;
}
export function portPose<P extends NavigationPart>(
  v: PortVessel<P>,
  id: string | null | undefined
): PortPose<P> | null {
  const p = v.parts.find(p => p.id === id);
  if (!p || !PARTS[p.type].docking) return null;
  const q = v.q.clone().multiply(partRotation(p)),
    position = new T.Vector3(0, PARTS[p.type].dockFace, 0)
      .applyQuaternion(q)
      .add(new T.Vector3(...p.p).applyQuaternion(v.q))
      .add(v.pos),
    normal = new T.Vector3(0, 1, 0).applyQuaternion(q),
    velocity = v.vel.clone().add(v.omega.clone().cross(position.clone().sub(centerOfVessel(v))));
  return {part: p, q, position, normal, velocity};
}
export function portGuidance(
  a: PortVessel,
  aId: string | null | undefined,
  b: PortVessel | null | undefined,
  bId: string | null | undefined
): PortGuidance | null {
  if (!b || a === b) return null;
  const own = portPose(a, aId),
    target = portPose(b, bId);
  if (!own || !target || own.part.dockPartner || target.part.dockPartner) return null;
  const right = new T.Vector3(1, 0, 0).applyQuaternion(target.q),
    top = new T.Vector3(0, 0, 1).applyQuaternion(target.q),
    outward = target.normal,
    offset = own.position.clone().sub(target.position),
    velocity = own.velocity.clone().sub(target.velocity),
    rotatingVelocity = velocity.clone().sub(b.omega.clone().cross(offset));
  return {
    own,
    target,
    right,
    top,
    outward,
    axial: offset.dot(outward),
    horizontal: offset.dot(right),
    vertical: offset.dot(top),
    lateral: Math.hypot(offset.dot(right), offset.dot(top)),
    closing: -rotatingVelocity.dot(outward),
    horizontalSpeed: rotatingVelocity.dot(right),
    verticalSpeed: rotatingVelocity.dot(top),
    speed: velocity.length(),
    angle: Math.acos(T.MathUtils.clamp(-own.normal.dot(outward), -1, 1)),
    desiredNormal: outward.clone().negate()
  };
}
// Manual axes: positive forward approaches the face; x/y slide on its plane.
export function portTranslation(
  guidance: PortGuidance | null | undefined,
  q: T.Quaternion,
  {forward = 0, right = 0, up = 0}: PortTranslationInput
): T.Vector3 {
  if (!guidance) return new T.Vector3();
  return guidance.outward
    .clone()
    .multiplyScalar(-forward)
    .addScaledVector(guidance.right, right)
    .addScaledVector(guidance.top, up)
    .applyQuaternion(q.clone().invert());
}
