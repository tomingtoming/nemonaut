import {saveKind, isSaveKind} from './app-id.js';
import {convertSavedPartFrame, SAVED_PART_FRAME} from './part-save-frame.js';
import {validateCraft, type FlightPart} from './core.js';
import {validateWorld, type SavedWorld} from './world-save.js';
import {FLIGHT_ENVIRONMENTS} from './flight-environments.js';

export interface WorkshopDraft {
  name: string;
  bay: string;
  environment: string;
  parts: FlightPart[];
}
export interface SavedGame {
  kind: string;
  version: number;
  /** Applies to workshop.parts only. World vessels carry their own frame versions. */
  partFrame?: string;
  world: SavedWorld;
  workshop: WorkshopDraft;
}
export interface CenteredGame extends SavedGame {
  version: 2;
  partFrame: typeof SAVED_PART_FRAME;
}
export interface GameRecordInput {
  world: SavedWorld;
  draft: WorkshopDraft | null | undefined;
}

function workshop(value: WorkshopDraft | null | undefined, centered: boolean): WorkshopDraft {
  if (
    !value ||
    typeof value.name !== 'string' ||
    value.name.length > 80 ||
    !['vab', 'sph'].includes(value.bay) ||
    !FLIGHT_ENVIRONMENTS.includes(value.environment) ||
    !Array.isArray(value.parts)
  )
    throw Error('組立中の設計の保存形式が不正です');
  const editable = centered ? value.parts : convertSavedPartFrame(value.parts, 'encode');
  return {
    name: value.name,
    bay: value.bay,
    environment: value.environment,
    parts: editable.length ? validateCraft({version: 1, parts: editable}) : []
  };
}
export function gameRecord({world, draft}: GameRecordInput): CenteredGame {
  return {
    kind: saveKind('game'),
    version: 2,
    partFrame: SAVED_PART_FRAME,
    world: validateWorld(world),
    workshop: workshop(draft, true)
  };
}
export function validateGame(value: SavedGame): CenteredGame {
  if (
    !isSaveKind(value?.kind, 'game') ||
    !(
      (value.version === 1 && value.partFrame === undefined) ||
      (value.version === 2 && value.partFrame === SAVED_PART_FRAME)
    )
  )
    throw Error('ゲーム保存の形式が不正です');
  return {
    kind: saveKind('game'),
    version: 2,
    partFrame: SAVED_PART_FRAME,
    world: validateWorld(value.world),
    workshop: workshop(value.workshop, value.version === 2)
  };
}
export const writeGame = validateGame;

/** Called only when handing the stored draft to the editor. */
export function editingParts(game: CenteredGame): FlightPart[] {
  return structuredClone(game.workshop.parts);
}
