import {PARTS, nodes, type PartType} from './catalog.js';

export interface AttachmentProfile {
  mode: 'stack';
  shape: 'circle';
  diameter: number;
}

/** Author-declared interface, not an estimate from the mesh envelope. */
export function attachmentProfile(type: PartType, node: number): AttachmentProfile | null {
  if (!Number.isInteger(node) || !nodes(type)[node]) throw Error('接続点の番号が不正です');
  const diameters = PARTS[type].stackDiameters;
  if (!diameters || (node !== 0 && node !== 1)) return null;
  return {mode: 'stack', shape: 'circle', diameter: diameters[node]};
}

/** Size compatibility only: pose, occupancy and fuel connectivity are separate checks.
 * Unknown is deliberately not a rejection of legacy or surface attachments.
 */
export function attachmentFit(
  parentType: PartType,
  parentNode: number,
  ownType: PartType,
  ownNode: number
): 'matched' | 'different-size' | 'unspecified' {
  const a = attachmentProfile(parentType, parentNode),
    b = attachmentProfile(ownType, ownNode);
  if (!a || !b) return 'unspecified';
  return Math.abs(a.diameter - b.diameter) <= 1e-6 ? 'matched' : 'different-size';
}
