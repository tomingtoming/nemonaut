import {saveKind, isSaveKind} from './app-id.js';
import {convertSavedPartFrame, SAVED_PART_FRAME} from './part-save-frame.js';
import {validateCraft, type FlightPart} from './core.js';
import {validateWorkspace, type LegacyWorkspace} from './workspace-save.js';
import {validateWorld, worldFromFlight, type SavedWorld} from './world-save.js';

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
export interface GameRecordInput {
  world: SavedWorld;
  draft: WorkshopDraft | null | undefined;
}

function workshop(value: WorkshopDraft | null | undefined): WorkshopDraft {
  if (
    !value ||
    typeof value.name !== 'string' ||
    value.name.length > 80 ||
    !['vab', 'sph'].includes(value.bay) ||
    !['land', 'runway', 'water', 'drop', 'orbit', 'entry', 'moon-orbit', 'moon-surface', 'transfer'].includes(
      value.environment
    ) ||
    !Array.isArray(value.parts)
  )
    throw Error('組立中の設計の保存形式が不正です');
  return {
    name: value.name,
    bay: value.bay,
    environment: value.environment,
    parts: value.parts.length ? validateCraft({version: 1, parts: value.parts}) : []
  };
}
export function gameRecord({world, draft}: GameRecordInput): SavedGame {
  return {kind: saveKind('game'), version: 1, world: validateWorld(world), workshop: workshop(draft)};
}
// Pure migration; browser storage is not touched. The caller must retain the
// original save before replacing it with this validated game record.
export function migrateWorkspace(value: LegacyWorkspace): SavedGame {
  const legacy = validateWorkspace(value);
  return gameRecord({
    world: worldFromFlight(legacy.flight, {universalTime: legacy.universalTime}),
    draft: legacy
  });
}
export function validateGame(value: SavedGame): SavedGame {
  if (
    !isSaveKind(value?.kind, 'game') ||
    !(
      (value.version === 1 && value.partFrame === undefined) ||
      (value.version === 2 && value.partFrame === SAVED_PART_FRAME)
    )
  )
    throw Error('ゲーム保存の形式が不正です');
  const draft =
    value.version === 2 && value.workshop
      ? {...value.workshop, parts: convertSavedPartFrame(value.workshop.parts, 'decode')}
      : value.workshop;
  return gameRecord({world: value.world, draft});
}
/** Encode at the persistence boundary; validateGame returns editing coordinates. */
export function writeGame(value: SavedGame): SavedGame {
  const game = validateGame(value);
  return {
    ...game,
    version: 2,
    partFrame: SAVED_PART_FRAME,
    workshop: {...game.workshop, parts: convertSavedPartFrame(game.workshop.parts, 'encode')}
  };
}
