import * as T from 'three';
import type {PartVector} from './catalog.js';

/** Saved pose of the authored part datum, expressed in vessel coordinates (metres/radians).
 * This is neither the part's mass centre nor the vessel's world-space pose.
 */
export interface PartPose {
  p: PartVector;
  r: PartVector;
}
export const partRotation = (part: Pick<PartPose, 'r'>): T.Quaternion =>
  new T.Quaternion().setFromEuler(new T.Euler(...part.r));

export function partPointToVessel(part: PartPose, point: readonly number[]): T.Vector3 {
  return new T.Vector3(...point).applyQuaternion(partRotation(part)).add(new T.Vector3(...part.p));
}

export function vesselPointToPart(part: PartPose, point: T.Vector3): T.Vector3 {
  return point
    .clone()
    .sub(new T.Vector3(...part.p))
    .applyQuaternion(partRotation(part).invert());
}

export function partDirectionToVessel(part: Pick<PartPose, 'r'>, direction: readonly number[]): T.Vector3 {
  return new T.Vector3(...direction).applyQuaternion(partRotation(part));
}
