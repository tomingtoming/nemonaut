import {storageKey} from './app-id.js';
import {validateGame, writeGame, type SavedGame, type CenteredGame} from './game-save.js';

export type GameStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const GAME_KEY = storageKey('game-v1');
const MAX_SAVE_LENGTH = 4000000;
export function readStoredGame(storage: GameStorage): CenteredGame | null {
  const raw = storage.getItem(GAME_KEY);
  if (raw === null) return null;
  if (raw.length > MAX_SAVE_LENGTH) throw Error('保存データが大きすぎます');
  return validateGame(JSON.parse(raw) as SavedGame);
}
export function writeStoredGame(storage: GameStorage, value: SavedGame): void {
  const serialized = JSON.stringify(writeGame(value));
  if (serialized.length > MAX_SAVE_LENGTH) throw Error('保存データが大きすぎます');
  // localStorage.setItem is atomic: a failed write leaves the previous save in place.
  storage.setItem(GAME_KEY, serialized);
}
export function backupStoredGame(storage: GameStorage, stamp: number = Date.now()): string | null {
  const raw = storage.getItem(GAME_KEY);
  if (raw === null) return null;
  let key = GAME_KEY + '-backup-' + stamp,
    index = 1;
  while (storage.getItem(key) !== null) key = GAME_KEY + '-backup-' + stamp + '-' + index++;
  storage.setItem(key, raw);
  return key;
}
