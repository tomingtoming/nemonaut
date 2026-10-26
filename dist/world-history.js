import {departureMode} from './departure-mode.js';
import {PLANET} from './planet.js';
import {surfaceOrigins,orbitalOrigins,orbitalReturnSources} from './launch-provenance.js';
const types=new Set(['launch','recover','terminate','orbit']);
export function validateHistory(value=[],time){
 if(!Array.isArray(value)||value.length>10000)throw Error('運用記録の形式または件数が不正です');
 const ids=new Set(),surfaceLaunches=new Set(),orbits=new Set(),origins=new Map(),orbitalParts=new Map();let previous=0;
 for(const event of value){
  if(!event||typeof event.id!=='string'||!event.id.length||event.id.length>256||ids.has(event.id)||!types.has(event.type)||typeof event.vesselId!=='string'||!event.vesselId.length||event.vesselId.length>256||typeof event.name!=='string'||event.name.length>80||!Number.isFinite(event.universalTime)||event.universalTime<previous||event.universalTime>time||!Number.isFinite(event.missionTime)||event.missionTime<0||event.missionTime>1e12||!Number.isInteger(event.parts)||event.parts<1||event.parts>400)throw Error('運用記録の値・順序・IDが不正です');
  if(event.environment!==undefined){if(event.type!=='launch')throw Error('開始条件は出発記録にのみ保存できます');departureMode(event.environment);}
  if(event.type==='launch'&&event.environment!==undefined&&departureMode(event.environment).mode==='surface')surfaceLaunches.add(event.vesselId);
  if(event.partIds!==undefined){
   if(!['launch','orbit','recover'].includes(event.type)||!Array.isArray(event.partIds)||event.partIds.length!==event.parts||new Set(event.partIds).size!==event.parts||event.partIds.some(id=>typeof id!=='string'||!id.length||id.length>200))throw Error('運用記録の部品IDが不正です');
   if(event.type==='launch')for(const id of event.partIds){if(origins.has(id))throw Error('部品の出発元が重複しています');origins.set(id,event);}
  }
  if(event.type!=='orbit'&&event.launchEventIds!==undefined)throw Error('出発元の参照は軌道投入記録にのみ保存できます');
  if(event.type==='orbit'){
   const o=event.orbit;
   let sourceProven=surfaceLaunches.has(event.vesselId);
   if(event.partIds!==undefined||event.launchEventIds!==undefined){
    const sources=event.partIds&&surfaceOrigins(event.partIds,origins);
    sourceProven=!!sources&&Array.isArray(event.launchEventIds)&&JSON.stringify([...event.launchEventIds].sort())===JSON.stringify(sources);
   }
   if(!sourceProven||orbits.has(event.vesselId)||!o||o.bodyId!=='planet'||!Number.isFinite(o.periapsis)||o.periapsis<=PLANET.atmosphereTop||!Number.isFinite(o.apoapsis)||o.apoapsis<o.periapsis)throw Error('軌道投入記録の出発履歴・軌道値・重複が不正です');
   orbits.add(event.vesselId);
   for(const id of event.partIds??[])if(!orbitalParts.has(id))orbitalParts.set(id,event.id);
  }else if(event.orbit!==undefined)throw Error('軌道値は軌道投入記録にのみ保存できます');
  if(event.bodyId!==undefined&&(event.type!=='recover'||!['planet','moon'].includes(event.bodyId)))throw Error('回収天体が不正です');
  if(event.orbitEventIds!==undefined){
   const sources=event.partIds&&orbitalReturnSources(event.partIds,orbitalParts);
   if(event.type!=='recover'||event.bodyId!=='planet'||!sources||!Array.isArray(event.orbitEventIds)||JSON.stringify([...event.orbitEventIds].sort())!==JSON.stringify(sources))throw Error('軌道帰還の証拠が不正です');
  }
  ids.add(event.id);previous=event.universalTime;
 }
 return structuredClone(value);
}
export function appendHistory(world,type,vessel,{orbit,launchEventIds,bodyId}={}){
 const event={id:crypto.randomUUID(),type,vesselId:vessel.vesselId,name:vessel.vesselName||'名称未設定の機体',universalTime:world.universalTime,missionTime:vessel.state.time,parts:vessel.parts.length};
 if(type==='launch'){departureMode(vessel.environment);event.environment=vessel.environment;event.partIds=vessel.parts.map(p=>p.id);}
 if(type==='orbit'){event.orbit=orbit;event.partIds=vessel.parts.map(p=>p.id);event.launchEventIds=launchEventIds;}
 if(type==='recover'){
  event.partIds=vessel.parts.map(p=>p.id);event.bodyId=bodyId;
  const sources=bodyId==='planet'&&orbitalReturnSources(event.partIds,orbitalOrigins(world.history));
  if(sources)event.orbitEventIds=sources;
 }
 return validateHistory([...world.history,event],world.universalTime);
}
