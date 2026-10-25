import {validateCraft} from './core.js';
import {validateWorkspace} from './workspace-save.js';
import {validateWorld,worldFromFlight} from './world-save.js';

function workshop(value){
 if(!value||typeof value.name!=='string'||value.name.length>80||!['vab','sph'].includes(value.bay)||!['land','runway','water','drop','orbit','entry','moon-orbit','moon-surface','transfer'].includes(value.environment)||!Array.isArray(value.parts))throw Error('組立中の設計の保存形式が不正です');
 return {name:value.name,bay:value.bay,environment:value.environment,parts:value.parts.length?validateCraft({version:1,parts:value.parts}):[]};
}
export function gameRecord({world,draft}){
 return {kind:'orbital-foundry-game',version:1,world:validateWorld(world),workshop:workshop(draft)};
}
// Pure migration; browser storage is not touched. The caller must retain the
// original save before replacing it with this validated game record.
export function migrateWorkspace(value){
 const legacy=validateWorkspace(value);
 return gameRecord({world:worldFromFlight(legacy.flight,{universalTime:legacy.universalTime}),draft:legacy});
}
export function validateGame(value){
 if(value?.kind!=='orbital-foundry-game'||value.version!==1)throw Error('ゲーム保存の形式が不正です');
 return gameRecord({world:value.world,draft:value.workshop});
}
