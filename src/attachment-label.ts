import type {PartType} from './catalog.js';
import {attachmentProfile, attachmentFit, type AttachmentProfile} from './attachment-profile.js';

export function attachmentProfileLabel(p: AttachmentProfile): string {
  const n = (value: number) => Number(value.toFixed(3));
  return p.shape === 'circle' ? 'Ø' + n(p.diameter) : n(p.width) + ' × ' + n(p.height);
}

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
  const fit = attachmentFit(parent, parentNode, own, ownNode);
  return fit === 'matched'
    ? attachmentProfileLabel(a) + ' m'
    : attachmentProfileLabel(a) +
        ' ↔ ' +
        attachmentProfileLabel(b) +
        ' m · ' +
        (fit === 'different-shape' ? '形状違い' : a.shape === 'circle' ? '異径' : '寸法違い');
}
