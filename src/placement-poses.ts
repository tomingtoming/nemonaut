import {PARTS, nodes, assemblyNode, nodeAxis, type PartType} from './catalog.js';
import * as T from 'three';

// One transform source for the visible placement ghosts and committed parts.
export interface PlacementPose {
  pos: T.Vector3;
  q: T.Quaternion;
}
/** Place the declared mounting point on the target, with opposing outward normals. */
export function surfacePlacementPose(type: string, point: T.Vector3, normal: T.Vector3): PlacementPose {
  const d = PARTS[type];
  const [x, y, z, nx, ny, nz] = assemblyNode(
    d.surfaceMount ?? [0, -d.size[1] / 2, 0, 0, -1, 0],
    d.modelCenter
  );
  const q = new T.Quaternion().setFromUnitVectors(
    new T.Vector3(nx, ny, nz).normalize(),
    normal.clone().normalize().negate()
  );
  return {pos: point.clone().sub(new T.Vector3(x, y, z).applyQuaternion(q)), q};
}
export function symmetryPlacementPoses(
  position: T.Vector3,
  rotation: T.Quaternion,
  mode: string,
  bay: string,
  type: string
): PlacementPose[] {
  const count = mode === 'mirror' ? 2 : Number(mode);
  if (![1, 2, 3, 4, 6, 8].includes(count)) throw Error('対称数が不正です');
  return Array.from({length: count}, (_, i) => {
    const pos = position.clone(),
      q = rotation.clone();
    if (mode === 'mirror' && i) {
      pos.x = -pos.x;
      const reflect = new T.Matrix4().makeScale(-1, 1, 1);
      q.setFromRotationMatrix(
        new T.Matrix4().makeRotationFromQuaternion(q).premultiply(reflect).multiply(reflect)
      );
      const mirror = PARTS[type]?.mirrorRotation;
      if (mirror) q.multiply(new T.Quaternion().setFromEuler(new T.Euler(...mirror)));
    } else if (i) {
      const axis = bay === 'vab' ? new T.Vector3(0, 1, 0) : new T.Vector3(0, 0, 1),
        turn = new T.Quaternion().setFromAxisAngle(axis, (i * 2 * Math.PI) / count);
      pos.applyQuaternion(turn);
      q.premultiply(turn);
    }
    return {pos, q};
  });
}

/** Orient a declared attachment node; otherwise inherit the parent's orientation. */
export function nodePlacementRotation(type: PartType, normal: T.Vector3, parent: T.Quaternion): T.Quaternion {
  const index = PARTS[type].placementNode;
  if (index === undefined) return parent.clone();
  const node = nodes(type)[index];
  if (!node) throw Error('優先接続点がありません');
  return new T.Quaternion().setFromUnitVectors(
    new T.Vector3(...nodeAxis(node)).normalize(),
    normal.clone().normalize().negate()
  );
}
