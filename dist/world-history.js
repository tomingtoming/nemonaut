import {departureMode} from './departure-mode.js';
import {PLANET} from './planet.js';
const types=new Set(['launch','recover','terminate','orbit']);
export function validateHistory(value=[],time){
 if(!Array.isArray(value)||value.length>10000)throw Error('運用記録の形式または件数が不正です');
 const ids=new Set(),surfaceLaunches=new Set(),orbits=new Set();let previous=0;
 for(const event of value){
  if(!event||typeof event.id!=='string'||!event.id.length||event.id.length>256||ids.has(event.id)||!types.has(event.type)||typeof event.vesselId!=='string'||!event.vesselId.length||event.vesselId.length>256||typeof event.name!=='string'||event.name.length>80||!Number.isFinite(event.universalTime)||event.universalTime<previous||event.universalTime>time||!Number.isFinite(event.missionTime)||event.missionTime<0||event.missionTime>1e12||!Number.isInteger(event.parts)||event.parts<1||event.parts>400)throw Error('運用記録の値・順序・IDが不正です');
  if(event.environment!==undefined){if(event.type!=='launch')throw Error('開始条件は出発記録にのみ保存できます');departureMode(event.environment);}
  if(event.type==='launch'&&event.environment!==undefined&&departureMode(event.environment).mode==='surface')surfaceLaunches.add(event.vesselId);
  if(event.type==='orbit'){
   const o=event.orbit;
   if(!surfaceLaunches.has(event.vesselId)||orbits.has(event.vesselId)||!o||o.bodyId!=='planet'||!Number.isFinite(o.periapsis)||o.periapsis<=PLANET.atmosphereTop||!Number.isFinite(o.apoapsis)||o.apoapsis<o.periapsis)throw Error('軌道投入記録の出発履歴・軌道値・重複が不正です');
   orbits.add(event.vesselId);
  }else if(event.orbit!==undefined)throw Error('軌道値は軌道投入記録にのみ保存できます');
  ids.add(event.id);previous=event.universalTime;
 }
 return structuredClone(value);
}
export function appendHistory(world,type,vessel,orbit){
 const event={id:crypto.randomUUID(),type,vesselId:vessel.vesselId,name:vessel.vesselName||'名称未設定の機体',universalTime:world.universalTime,missionTime:vessel.state.time,parts:vessel.parts.length};
 if(type==='launch'){departureMode(vessel.environment);event.environment=vessel.environment;}
 if(type==='orbit')event.orbit=orbit;
 return validateHistory([...world.history,event],world.universalTime);
}
