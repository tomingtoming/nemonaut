import {PARTS, nodes, type PartType} from './catalog.js';

export type AttachmentProfile =
  | {
      mode: 'stack';
      shape: 'circle';
      diameter: number;
    }
  | {mode: 'stack'; shape: 'rectangle'; width: number; height: number};

/** Author-declared interface, not an estimate from the mesh envelope. */
export function attachmentProfile(type: PartType, node: number): AttachmentProfile | null {
  if (!Number.isInteger(node) || !nodes(type)[node]) throw Error('接続点の番号が不正です');
  if (node !== 0 && node !== 1) return null;
  const rectangle = PARTS[type].stackRectangles?.[node];
  if (rectangle) return {mode: 'stack', shape: 'rectangle', width: rectangle[0], height: rectangle[1]};
  const diameters = PARTS[type].stackDiameters;
  if (!diameters) return null;
  const diameter = diameters[node];
  return diameter === null ? null : {mode: 'stack', shape: 'circle', diameter};
}

/** Size compatibility only: pose, occupancy and fuel connectivity are separate checks.
 * Unknown is deliberately not a rejection of legacy or surface attachments.
 */
export function attachmentFit(
  parentType: PartType,
  parentNode: number,
  ownType: PartType,
  ownNode: number
): 'matched' | 'different-size' | 'different-shape' | 'unspecified' {
  const a = attachmentProfile(parentType, parentNode),
    b = attachmentProfile(ownType, ownNode);
  if (!a || !b) return 'unspecified';
  const close = (x: number, y: number) => Math.abs(x - y) <= 1e-6;
  if (a.shape === 'circle' && b.shape === 'circle')
    return close(a.diameter, b.diameter) ? 'matched' : 'different-size';
  if (a.shape === 'rectangle' && b.shape === 'rectangle')
    return close(a.width, b.width) && close(a.height, b.height) ? 'matched' : 'different-size';
  return 'different-shape';
}
