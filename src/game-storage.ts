import {storageKey} from './app-id.js';
import {WORKSPACE_KEY,type LegacyWorkspace} from './workspace-save.js';
import {validateGame,migrateWorkspace,type SavedGame} from './game-save.js';

export type GameStorage=Pick<Storage,'getItem'|'setItem'>;
export interface StoredGame{game:SavedGame;migrated:boolean}

export const GAME_KEY=storageKey('game-v1');
const MAX_SAVE_LENGTH=4000000;
function parse(raw:string):unknown{
 if(raw.length>MAX_SAVE_LENGTH)throw Error('保存データが大きすぎます');
 return JSON.parse(raw);
}
export function readStoredGame(storage:GameStorage):StoredGame|null{
 const current=storage.getItem(GAME_KEY);
 // A broken current save must not rewind to a stale legacy world.
 if(current!==null)return {game:validateGame(parse(current) as SavedGame),migrated:false};
 const legacy=storage.getItem(WORKSPACE_KEY);
 if(legacy===null)return null;
 return {game:migrateWorkspace(parse(legacy) as LegacyWorkspace),migrated:true};
}
export function writeStoredGame(storage:GameStorage,value:SavedGame):void{
 const serialized=JSON.stringify(validateGame(value));
 if(serialized.length>MAX_SAVE_LENGTH)throw Error('保存データが大きすぎます');
 // localStorage.setItem is atomic. Keep the legacy key as the original
 // migration backup; never remove it or overwrite it on new-format saves.
 storage.setItem(GAME_KEY,serialized);
}
export function backupStoredGame(storage:GameStorage,stamp:number=Date.now()):string|null{
 const source=storage.getItem(GAME_KEY)!==null?GAME_KEY:WORKSPACE_KEY;
 const raw=storage.getItem(source);
 if(raw===null)return null;
 let key=source+'-backup-'+stamp,index=1;
 while(storage.getItem(key)!==null)key=source+'-backup-'+stamp+'-'+index++;
 storage.setItem(key,raw);
 return key;
}
