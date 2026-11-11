import {storageKey} from './app-id.js';
import type {FlightPart} from './core.js';
import {loadCraft, saveCraft} from './craft-save.js';
import {SAVED_PART_FRAME} from './part-save-frame.js';
import {FLIGHT_ENVIRONMENTS} from './flight-environments.js';
export const DESIGN_LIBRARY_KEY = storageKey('design-library-v1');
export interface DesignRecord {
  id: string;
  name: string;
  bay: string;
  environment: string;
  savedAt: number;
  parts: FlightPart[];
}
export interface DesignLibrary {
  version: 2;
  partFrame: typeof SAVED_PART_FRAME;
  designs: DesignRecord[];
}
export interface DesignRecordInput {
  id?: unknown;
  name?: unknown;
  bay: string;
  environment: string;
  savedAt: number;
  parts?: FlightPart[];
}
export interface DesignLibraryInput {
  version?: unknown;
  partFrame?: unknown;
  designs?: DesignRecordInput[];
}
export interface DesignDraft {
  name: string;
  parts: FlightPart[];
  bay: string;
  environment: string;
}
export function readDesignLibrary(value: DesignLibraryInput | null | undefined): DesignLibrary {
  if (
    !value ||
    !(
      (value.version === 1 && value.partFrame === undefined) ||
      (value.version === 2 && value.partFrame === SAVED_PART_FRAME)
    ) ||
    !Array.isArray(value.designs) ||
    value.designs.length > 100
  )
    throw Error('設計一覧の形式が不正です');
  const ids = new Set();
  const designs = value.designs.map(d => {
    if (
      typeof d.id !== 'string' ||
      !d.id ||
      ids.has(d.id) ||
      typeof d.name !== 'string' ||
      d.name.length > 80 ||
      !['vab', 'sph'].includes(d.bay) ||
      !FLIGHT_ENVIRONMENTS.includes(d.environment) ||
      !Number.isFinite(d.savedAt) ||
      d.savedAt < 0
    )
      throw Error('設計一覧の項目が不正です');
    ids.add(d.id);
    const loaded = loadCraft({version: value.version, partFrame: value.partFrame, parts: d.parts});
    return {
      id: d.id,
      name: d.name,
      bay: d.bay,
      environment: d.environment,
      savedAt: d.savedAt,
      parts: loaded
    };
  });
  return {version: 2, partFrame: SAVED_PART_FRAME, designs};
}
export const writeDesignLibrary = readDesignLibrary;
export function appendDesign(
  library: DesignLibraryInput | null | undefined,
  {name, parts, bay, environment}: DesignDraft,
  id: string = crypto.randomUUID(),
  savedAt: number = Date.now()
): DesignLibrary {
  const valid = readDesignLibrary(library);
  if (valid.designs.length >= 100) throw Error('設計一覧は100件までです。JSON出力で機体を保管してください。');
  return readDesignLibrary({
    ...valid,
    designs: [
      ...valid.designs,
      {id, name: name.slice(0, 80), parts: saveCraft(parts, name).parts, bay, environment, savedAt}
    ]
  });
}
export function designForLaunch(
  library: DesignLibraryInput | null | undefined,
  id: string,
  facility: string
): DesignRecord {
  const valid = readDesignLibrary(library),
    design = valid.designs.find(d => d.id === id);
  if (!design) throw Error('保存した設計が見つかりません');
  if (!['pad', 'runway'].includes(facility)) throw Error('出発施設が不正です');
  if (design.parts.filter(p => !p.parent).length !== 1)
    throw Error('独立した部品を接続してから出発してください');
  return {
    ...design,
    environment: facility === 'pad' ? 'land' : 'runway'
  };
}
