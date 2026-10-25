import {WORKSPACE_KEY} from './workspace-save.js';
import {validateGame,migrateWorkspace} from './game-save.js';

export const GAME_KEY='orbital-foundry-game-v1';
const MAX_SAVE_LENGTH=4000000;
function parse(raw){
 if(raw.length>MAX_SAVE_LENGTH)throw Error('保存データが大きすぎます');
 return JSON.parse(raw);
}
export function readStoredGame(storage){
 const current=storage.getItem(GAME_KEY);
 // A broken current save must not rewind to a stale legacy world.
 if(current!==null)return {game:validateGame(parse(current)),migrated:false};
 const legacy=storage.getItem(WORKSPACE_KEY);
 if(legacy===null)return null;
 return {game:migrateWorkspace(parse(legacy)),migrated:true};
}
export function writeStoredGame(storage,value){
 const serialized=JSON.stringify(validateGame(value));
 if(serialized.length>MAX_SAVE_LENGTH)throw Error('保存データが大きすぎます');
 // localStorage.setItem is atomic. Keep the legacy key as the original
 // migration backup; never remove it or overwrite it on new-format saves.
 storage.setItem(GAME_KEY,serialized);
}
export function backupStoredGame(storage,stamp=Date.now()){
 const source=storage.getItem(GAME_KEY)!==null?GAME_KEY:WORKSPACE_KEY;
 const raw=storage.getItem(source);
 if(raw===null)return null;
 let key=source+'-backup-'+stamp,index=1;
 while(storage.getItem(key)!==null)key=source+'-backup-'+stamp+'-'+index++;
 storage.setItem(key,raw);
 return key;
}
