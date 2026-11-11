// The inertia tensor of a vessel about a point (kept apart from docking.ts so that vessel-collision does not
// import docking, which imports core). No import-time side effects; docking.ts re-exports it.
import * as T from 'three';
import {centerOfMass, type MassCenteredVessel} from './center-of-mass.js';
/** The vessel fields the tensor is read from: the solver body holds the mass model of the colliders. */
export interface InertiaVessel extends MassCenteredVessel {
  body: Pick<import('./physics.js').RigidBody, 'mass' | 'principalInertia' | 'principalInertiaLocalFrame'>;
}
/**
 * World-frame inertia tensor about a world-space point. The principal moments and axes are the solver's
 * (the same values core.ts and angular-momentum.ts read), so compound colliders, hollow shells and folded
 * gear count as the solver counts them; the parallel-axis term moves it from the centre of mass to `point`.
 * Flight.q is authoritative for the orientation, as in angular-momentum.ts.
 */
export function inertiaAbout(v: InertiaVessel, point: T.Vector3): T.Matrix3 {
  const i = v.body.principalInertia(),
    f = v.body.principalInertiaLocalFrame(),
    r = new T.Matrix3().setFromMatrix4(
      new T.Matrix4().makeRotationFromQuaternion(
        v.q
          .clone()
          .multiply(new T.Quaternion(f.x, f.y, f.z, f.w))
          .normalize()
      )
    ),
    tensor = r
      .clone()
      .multiply(new T.Matrix3().set(i.x, 0, 0, 0, i.y, 0, 0, 0, i.z))
      .multiply(r.clone().transpose()),
    m = v.body.mass(),
    offset = centerOfMass(v).sub(point),
    a = offset.toArray(),
    s = offset.lengthSq();
  for (let row = 0; row < 3; row++)
    for (let column = 0; column < 3; column++)
      tensor.elements[column * 3 + row] += m * ((row === column ? s : 0) - a[row] * a[column]);
  return tensor;
}
