import {storageKey,saveKind,isSaveKind} from './app-id.js';
import {needsPhysicsMigration} from './physics-migration.js';
import {validUniversalTime} from './universal-time.js';
import {validateCraft,type FlightPart} from './core.js';
import {loadFlight,saveFlight,type SavedFlight} from './flight-save.js';
export interface SavedWorkspace{kind:string;version:number;universalTime:number;bay:string;environment:string;name:string;parts:FlightPart[];flight:SavedFlight|null}
// Older workspace saves predate the shared universal time.
export type LegacyWorkspace=Omit<SavedWorkspace,'universalTime'>&{universalTime?:number};
export interface WorkspaceDraft{parts:FlightPart[];name:string;bay:string;environment:string;flight?:SavedFlight|null;universalTime?:number}
export const WORKSPACE_KEY=storageKey('workspace-v1');
export function validateWorkspace(value:LegacyWorkspace):SavedWorkspace{
 if(!isSaveKind(value?.kind,'workspace')||value.version!==1||!['vab','sph'].includes(value.bay)||!['land','runway','water','drop','orbit','entry','moon-orbit','moon-surface','transfer'].includes(value.environment)||typeof value.name!=='string'||value.name.length>80||!Array.isArray(value.parts))throw Error('宇宙センターの保存形式が不正です');
 const parts=value.parts.length?validateCraft({version:1,parts:value.parts}):[];
 let flightTime=0,normalizedFlight=structuredClone(value.flight);if(value.flight!==null){const restored=loadFlight(value.flight);flightTime=restored.universalTime;if(needsPhysicsMigration(value.flight))normalizedFlight=saveFlight(restored,value.flight.meta);restored.dispose();}const universalTime=validUniversalTime(value.universalTime??flightTime);if(value.flight!==null&&universalTime!==flightTime)throw Error('保存した飛行と宇宙センターの共通時刻が一致しません');
 return {kind:value.kind,version:1,universalTime,bay:value.bay,environment:value.environment,name:value.name,parts,flight:normalizedFlight};
}
export function workspaceRecord({parts,name,bay,environment,flight=null,universalTime=flight?.universalTime??0}:WorkspaceDraft):SavedWorkspace{return {universalTime:validUniversalTime(universalTime),kind:saveKind('workspace'),version:1,parts:structuredClone(parts),name:name.slice(0,80),bay,environment,flight:structuredClone(flight)};}
