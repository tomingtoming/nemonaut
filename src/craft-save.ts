import {validateCraft, type CraftRecord, type FlightPart} from './core.js';
import {convertSavedPartFrame, SAVED_PART_FRAME} from './part-save-frame.js';

export interface SavedCraftInput extends CraftRecord {
  name?: unknown;
  partFrame?: unknown;
}

/** External workshop JSON. Internal drafts still use authored coordinates. */
export function saveCraft(parts: FlightPart[], name: string) {
  const checked = parts.length ? validateCraft({version: 1, parts}) : [];
  return {
    version: 2,
    partFrame: SAVED_PART_FRAME,
    name: name.slice(0, 80),
    parts: convertSavedPartFrame(checked, 'encode')
  };
}

export function loadCraft(value: SavedCraftInput | null | undefined): FlightPart[] {
  if (!value) throw Error('機体の保存形式が不正です');
  if (value.version === 1 && value.partFrame === undefined) return validateCraft(value);
  if (value.version !== 2 || value.partFrame !== SAVED_PART_FRAME || !value.parts)
    throw Error('機体の保存形式または座標規約が不正です');
  return validateCraft({version: 1, parts: convertSavedPartFrame(value.parts, 'decode')});
}
