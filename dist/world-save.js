import {loadFlight,saveFlight} from './flight-save.js';
import {validUniversalTime} from './universal-time.js';

// Persistent ownership is a flat world. The flight tree is only an adapter for
// the existing simulation, and must not dictate ownership or vessel identity.
function flatten(record,out=[]){
 const {detached,meta,...vessel}=record;
 out.push(vessel);
 for(const child of detached??[])flatten(child,out);
 return out;
}
function rawFlight(world,activeId=world.activeVesselId){
 if(!world.vessels.length)return null;
 const selected=activeId??world.vessels[0].vesselId;
 const active=world.vessels.find(v=>v.vesselId===selected);
 if(!active)throw Error('選択した機体が世界に存在しません');
 const meta=structuredClone(world.flightMeta??{});
 if(selected!==world.activeVesselId){meta.name=active.vesselName;meta.pilot=null;}
 return structuredClone({...active,meta,detached:world.vessels.filter(v=>v!==active).map(v=>({...v,detached:[]}))});
}
export function worldFromFlight(record,{universalTime}={}){
 if(!record)return {kind:'orbital-foundry-world',version:1,universalTime:validUniversalTime(universalTime??0),activeVesselId:null,vessels:[],flightMeta:{}};
 const root=loadFlight(record);
 try{
  if(universalTime!==undefined&&root.universalTime!==universalTime)throw Error('世界と機体の共通時刻が一致しません');
  const normalized=saveFlight(root,record.meta);
  return {kind:'orbital-foundry-world',version:1,universalTime:root.universalTime,activeVesselId:root.vesselId,vessels:flatten(normalized),flightMeta:normalized.meta};
 }finally{root.dispose();}
}
export function validateWorld(value){
 if(value?.kind!=='orbital-foundry-world'||value.version!==1||!Array.isArray(value.vessels)||value.vessels.length>400)throw Error('世界保存の形式が不正です');
 const time=validUniversalTime(value.universalTime),ids=new Set();
 for(const v of value.vessels){
  if(!v||typeof v.vesselId!=='string'||!v.vesselId.length||v.vesselId.length>256||ids.has(v.vesselId)||Object.hasOwn(v,'detached')||v.universalTime!==time)throw Error('世界の機体ID・時刻・所属が不正です');
  ids.add(v.vesselId);
 }
 if(value.activeVesselId!==null&&!ids.has(value.activeVesselId))throw Error('操縦対象が世界に存在しません');
 if(value.flightMeta!==undefined&&(value.flightMeta===null||typeof value.flightMeta!=='object'||Array.isArray(value.flightMeta)))throw Error('飛行の表示情報が不正です');
 const raw=rawFlight(value);
 if(!raw)return {...worldFromFlight(null,{universalTime:time}),flightMeta:structuredClone(value.flightMeta??{})};
 // Reuse global part budgets, resources, target/port references and physics
 // validation across the entire world, not independently per vessel.
 const normalized=worldFromFlight(raw,{universalTime:time});
 const byId=new Map(normalized.vessels.map(v=>[v.vesselId,v]));
 normalized.vessels=value.vessels.map(v=>byId.get(v.vesselId));
 normalized.activeVesselId=value.activeVesselId;
 return normalized;
}
export function flightFromWorld(value,{activeVesselId=value.activeVesselId}={}){
 return rawFlight(validateWorld(value),activeVesselId);
}
