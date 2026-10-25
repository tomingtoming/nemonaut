import {validateCraft} from './core.js';
import {loadFlight} from './flight-save.js';
export const WORKSPACE_KEY='orbital-foundry-workspace-v1';
export function validateWorkspace(value){
 if(value?.kind!=='orbital-foundry-workspace'||value.version!==1||!['vab','sph'].includes(value.bay)||!['land','runway','water','drop','orbit','entry'].includes(value.environment)||typeof value.name!=='string'||value.name.length>80||!Array.isArray(value.parts))throw Error('宇宙センターの保存形式が不正です');
 const parts=value.parts.length?validateCraft({version:1,parts:value.parts}):[];
 if(value.flight!==null){const restored=loadFlight(value.flight);restored.dispose();}
 return {kind:value.kind,version:1,bay:value.bay,environment:value.environment,name:value.name,parts,flight:structuredClone(value.flight)};
}
export function workspaceRecord({parts,name,bay,environment,flight=null}){return {kind:'orbital-foundry-workspace',version:1,parts:structuredClone(parts),name:name.slice(0,80),bay,environment,flight:structuredClone(flight)};}
