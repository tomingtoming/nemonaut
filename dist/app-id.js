// Storage keys and save-format kinds. The game was renamed from Orbital Foundry to Omnivehicle
// on 2026-11-01: new data uses `omnivehicle-*`; older saves (`orbital-foundry-*`, including the
// frozen Golden v1/v2 baselines) are still accepted when read.
export const APP='omnivehicle',LEGACY_APP='orbital-foundry';
export const storageKey=name=>APP+'-'+name;
export const saveKind=name=>APP+'-'+name;
export const isSaveKind=(value,name)=>value===APP+'-'+name||value===LEGACY_APP+'-'+name;
// Moves browser data saved under the old prefix to the new one, keeping newer data if both exist.
export function migrateLegacyStorage(storage=globalThis.localStorage){
 if(!storage)return 0;let moved=0;
 try{
  const old=[];for(let i=0;i<storage.length;i++){const k=storage.key(i);if(k?.startsWith(LEGACY_APP+'-'))old.push(k);}
  for(const k of old){const next=APP+k.slice(LEGACY_APP.length);if(storage.getItem(next)===null){storage.setItem(next,storage.getItem(k));moved++;}storage.removeItem(k);}
 }catch{}
 return moved;
}
