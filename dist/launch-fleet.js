import {validUniversalTime,setUniversalTime} from './universal-time.js';
import {normalizeSymmetry} from './symmetry.js';
import {Flight,validateCraft} from './core.js';import {PARTS} from './catalog.js';import {loadFlight} from './flight-save.js';import {fleet} from './fleet.js';
export function freshLaunchParts(parts,used=new Set(),makeId=()=>crypto.randomUUID()){
 const copy=validateCraft({version:1,parts}),ids=new Map();for(const p of copy){const id=makeId();if(typeof id!=='string'||!id||id.length>200||used.has(id)||[...ids.values()].includes(id))throw Error('新しい部品IDが重複しています');ids.set(p.id,id);}
 for(const p of copy){const old=p.id;p.id=ids.get(old);if(p.parent)p.parent=ids.get(p.parent);if(p.dockPartner)p.dockPartner=ids.get(p.dockPartner);}return normalizeSymmetry(copy,{fresh:true});
}
// Returns a new owned fleet. The serialized prior world is never mutated, even
// on failure. Callers dispose this returned root if they do not adopt it.
export function launchIntoFleet(record,{parts,environment,name,universalTime}){
 if(!['land','runway','water','drop','orbit','entry','moon-orbit'].includes(environment)||typeof name!=='string')throw Error('出発条件が不正です');
 const checked=validateCraft({version:1,parts});if(checked.filter(p=>!p.parent).length!==1||!checked.some(p=>PARTS[p.type].control))throw Error('出発には接続済みの機体と制御装置が必要です');
 let previous=null,launched=null;try{
  previous=record?loadFlight(record):null;const others=previous?fleet(previous):[],used=new Set(others.flatMap(v=>v.parts.map(p=>p.id)));if(used.size+checked.length>400)throw Error('飛行中の合計部品数が400を超えます。既存の飛行は保持されています。');
  const time=validUniversalTime(universalTime??previous?.universalTime??0);if(previous&&time!==previous.universalTime)throw Error('出発時の共通時刻が保存と一致しません');const fresh=freshLaunchParts(checked,used);launched=new Flight(fresh,environment,time);const base=name.trim().slice(0,70)||'新しい機体',names=new Set(others.map(v=>v.vesselName));let candidate=base,index=2;while(names.has(candidate))candidate=base+' / '+index++;launched.vesselName=candidate;
  // Flatten older launch groups: the depth limit must not become a launch limit.
  for(const v of others)v.detached=[];launched.detached=others;setUniversalTime(launched,time);return launched;
 }catch(e){if(launched)launched.dispose();if(previous)previous.dispose();throw e;}
}
