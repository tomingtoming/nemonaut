import {validateCraft} from './core.js';
export const DESIGN_LIBRARY_KEY='orbital-foundry-design-library-v1';
const environments=['land','runway','water','drop','orbit','entry','moon-orbit','moon-surface','transfer'];
export function readDesignLibrary(value){
 if(!value||value.version!==1||!Array.isArray(value.designs)||value.designs.length>100)throw Error('設計一覧の形式が不正です');
 const ids=new Set();const designs=value.designs.map(d=>{if(typeof d.id!=='string'||!d.id||ids.has(d.id)||typeof d.name!=='string'||d.name.length>80||!['vab','sph'].includes(d.bay)||!environments.includes(d.environment)||!Number.isFinite(d.savedAt)||d.savedAt<0)throw Error('設計一覧の項目が不正です');ids.add(d.id);return {id:d.id,name:d.name,bay:d.bay,environment:d.environment,savedAt:d.savedAt,parts:validateCraft({version:1,parts:d.parts})};});return {version:1,designs};
}
export function appendDesign(library,{name,parts,bay,environment},id=crypto.randomUUID(),savedAt=Date.now()){
 const valid=readDesignLibrary(library);if(valid.designs.length>=100)throw Error('設計一覧は100件までです。JSON出力で機体を保管してください。');return readDesignLibrary({version:1,designs:[...valid.designs,{id,name:name.slice(0,80),parts,bay,environment,savedAt}]});
}
export function designForLaunch(library,id,facility){const valid=readDesignLibrary(library),design=valid.designs.find(d=>d.id===id);if(!design)throw Error('保存した設計が見つかりません');if(!['pad','runway'].includes(facility))throw Error('出発施設が不正です');if(design.parts.filter(p=>!p.parent).length!==1)throw Error('独立した部品を接続してから出発してください');return {...structuredClone(design),environment:facility==='pad'?'land':'runway'};}
