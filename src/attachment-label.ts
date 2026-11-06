import type {PartType} from './catalog.js';
import {attachmentProfile, attachmentFit} from './attachment-profile.js';

/** Compact workshop text; an unspecified end is never presented as a mismatch. */
export function attachmentSizeLabel(
  parent: PartType,
  parentNode: number,
  own: PartType,
  ownNode: number
): string {
  const a = attachmentProfile(parent, parentNode),
    b = attachmentProfile(own, ownNode);
  if (!a || !b) return '';
  const diameter = (n: number) => Number(n.toFixed(3));
  return attachmentFit(parent, parentNode, own, ownNode) === 'matched'
    ? `Ø${diameter(a.diameter)} m`
    : `Ø${diameter(a.diameter)} ↔ Ø${diameter(b.diameter)} m · 異径`;
}
