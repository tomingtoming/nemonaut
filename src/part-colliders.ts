import {cargoCollisionBoxes, hasCargoBay} from './cargo-geometry.js';
import * as T from 'three';
import RAPIER from './physics.js';
import {PARTS} from './catalog.js';
import {partCenter, partRotation, type AeroPart} from './aero.js';
import {foldedWheelRadius} from './landing-gear.js';

// Box centers are relative to the part's mass center, in local part axes.
// Volume-weighted geometry must preserve that center: statistics and free-flight
// integration use the same center as Rapier.
/** The part fields createPartColliders reads (a catalog Part satisfies it). */
export interface ColliderPart extends AeroPart {
  cargoOpen?: boolean;
}
/** One Rapier collider of a part and its share of the part mass. */
export interface PartCollider {
  weight: number;
  collider: import('./physics.js').Collider;
}
const cuboid = (half: readonly number[]) => {
  const [x, y, z] = half;
  return RAPIER.ColliderDesc.cuboid(x, y, z);
};
interface ColliderPiece {
  shape: import('./physics.js').ColliderDesc;
  offset: T.Vector3;
  localRotation?: T.Quaternion;
  weight: number;
}
export function createPartColliders(
  world: import('./physics.js').World,
  body: import('./physics.js').RigidBody,
  part: ColliderPart,
  mass: number,
  {folded}: {folded?: T.Vector3} = {}
): PartCollider[] {
  const d = PARTS[part.type],
    rotation = partRotation(part),
    // Folded gear (BACKLOG 9c): its mass centre and collider move with the folded visual (landing-gear.ts).
    retracted = folded !== undefined,
    center = folded ?? partCenter(part);
  const boxes = hasCargoBay(d) ? cargoCollisionBoxes(d, part.cargoOpen) : d.collisionBoxes;
  let pieces: ColliderPiece[];
  if (boxes) {
    if (!Array.isArray(boxes) || !boxes.length) throw Error('Empty compound collider');
    let volume = 0;
    const centroid = new T.Vector3();
    for (const box of boxes) {
      if (
        !Array.isArray(box.center) ||
        box.center.length !== 3 ||
        !box.center.every(Number.isFinite) ||
        !Array.isArray(box.size) ||
        box.size.length !== 3 ||
        !box.size.every(n => Number.isFinite(n) && n > 0)
      )
        throw Error('Invalid collision box');
      const v = box.size.reduce((a, b) => a * b, 1);
      volume += v;
      centroid.addScaledVector(new T.Vector3(...box.center), v);
    }
    if (centroid.divideScalar(volume).length() > 1e-7)
      throw Error('Compound collider must preserve part mass center');
    pieces = boxes.map(box => ({
      shape: cuboid(box.size.map(n => n / 2)),
      offset: new T.Vector3(...box.center),
      localRotation: new T.Quaternion().setFromEuler(new T.Euler(...(box.rotation || [0, 0, 0]))),
      weight: box.size.reduce((a, b) => a * b, 1) / volume
    }));
  } else
    pieces = [
      {
        // A folded wheel is a ball the size of its shrunken visual, with body friction: where the gear folds
        // into the body the belly meets the ground first; where it folds outside, it scrapes instead of rolling.
        shape: d.wheel
          ? RAPIER.ColliderDesc.ball(retracted ? foldedWheelRadius(part.type) : d.size[1] / 2)
          : cuboid(d.size.map(n => Math.max(0.02, n / 2))),
        offset: new T.Vector3(),
        weight: 1
      }
    ];
  return pieces.map(({shape, offset, weight, localRotation}) => ({
    weight,
    collider: world.createCollider(
      shape
        .setTranslation(...offset.applyQuaternion(rotation).add(center).toArray())
        .setRotation(rotation.clone().multiply(localRotation || new T.Quaternion()))
        .setMass(mass * weight)
        .setFriction(d.wheel && !retracted ? 0.015 : 0.35)
        .setRestitution(0),
      body
    )
  }));
}
