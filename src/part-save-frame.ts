import {partDirectionToVessel, type PartPose} from './part-frame.js';

export const SAVED_PART_FRAME = 'nominal-center-v1';
// Save-format constants, NOT live mass centres. Never edit these offsets when
// tuning a part: a different datum needs a new format and migration.
const centers: Readonly<Record<string, readonly [number, number, number]>> = {
  wing: [1, 0, 0],
  fin: [1, 0, 0],
  wingLarge: [3, 0, 0],
  transportWing: [7, 0, 0],
  transportWingRoot: [7, 0, 0]
};

/** Check pose shape before conversion; the caller validates the complete decoded craft. */
export function convertSavedPartFrame<P extends PartPose & {type: string}>(
  parts: readonly P[],
  direction: 'encode' | 'decode'
): P[] {
  if (!Array.isArray(parts) || parts.length > 400) throw Error('部品座標が不正です');
  return parts.map(part => {
    if (
      !part ||
      typeof part.type !== 'string' ||
      ![part.p, part.r].every(vector => {
        return Array.isArray(vector) && vector.length === 3 && vector.every(Number.isFinite);
      })
    )
      throw Error('部品座標が不正です');
    const copy = structuredClone(part),
      offset = Object.hasOwn(centers, part.type) ? centers[part.type] : undefined;
    if (offset) {
      const delta = partDirectionToVessel(part, offset).multiplyScalar(direction === 'encode' ? 1 : -1);
      copy.p = [part.p[0] + delta.x, part.p[1] + delta.y, part.p[2] + delta.z];
    }
    return copy;
  });
}
